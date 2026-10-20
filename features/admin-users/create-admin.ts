import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { createAuth } from "@/lib/auth/config";

export type CreateAdminInput = {
  email: string;
  name: string;
  password: string;
  readOnly?: boolean;
};

/**
 * Creates (or promotes) an admin with a verified email and a password (03: the first admin is
 * created by the setup command; later admins are invited by an admin). Goes through Better
 * Auth's internal adapter so the password hash and account rows match what sign-in expects.
 */
export async function createOrPromoteAdmin(
  db: Db,
  input: CreateAdminInput,
  actor: AuditActor = { type: "system", id: null },
): Promise<{ id: string; created: boolean }> {
  const email = input.email.toLowerCase().trim();
  const auth = createAuth(db, { nextCookies: false });
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  let id: string;
  let created = false;
  if (existing) {
    id = existing.id;
    await db
      .update(users)
      .set({
        role: "admin",
        emailVerified: true,
        isActive: true,
        readOnly: input.readOnly ?? false,
      })
      .where(eq(users.id, id));
    const accounts = await ctx.internalAdapter.findAccounts(id);
    if (accounts.some((a) => a.providerId === "credential")) {
      await ctx.internalAdapter.updatePassword(id, hash);
    } else {
      await ctx.internalAdapter.linkAccount({
        userId: id,
        providerId: "credential",
        accountId: id,
        password: hash,
      });
    }
  } else {
    const user = await ctx.internalAdapter.createUser(
      {
        email,
        name: input.name,
        emailVerified: true,
        role: "admin",
        isActive: true,
        readOnly: input.readOnly ?? false,
      },
      { method: "admin" },
    );
    id = user.id;
    created = true;
    await ctx.internalAdapter.linkAccount({
      userId: id,
      providerId: "credential",
      accountId: id,
      password: hash,
    });
    // The create hook only forces "customer" for endpoint calls; make the role explicit anyway.
    await db.update(users).set({ role: "admin" }).where(eq(users.id, id));
  }

  await writeAudit(db, {
    actor,
    action: created ? "admin.create" : "admin.promote",
    entityType: "user",
    entityId: id,
    after: { email, name: input.name, role: "admin", readOnly: input.readOnly ?? false },
    meta: { ip: null, userAgent: "setup-command", country: null },
  });
  return { id, created };
}

/** Readable random password for printed setup credentials. */
export function generatePassword(length = 18): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
