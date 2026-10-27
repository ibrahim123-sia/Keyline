"use server";

import { and, eq, like, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Db, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { apiTokens, sessions, twoFactors, users, verifications } from "@/db/schema/auth";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { createAuth } from "@/lib/auth/config";
import { sendAdminInviteEmail } from "@/lib/auth/emails";
import { sha256Hex } from "@/lib/crypto";
import { randomToken } from "@/lib/ids";

/** Invite links stay valid a week (password-reset links stay one hour). */
const INVITE_DAYS = 7;

async function findAdmin(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, "admin"), eq(users.agencyId, currentAgencyId())));
  if (!row) throw new ActionError("This admin no longer exists.", "NOT_FOUND");
  return row;
}

/**
 * Emails a "set your password" link (03: admins are invited by email). It is a Better Auth
 * password-reset token with a longer life, so the normal reset screen and rules apply.
 */
async function sendInvite(
  db: Db,
  user: { id: string; email: string; name: string },
  invitedBy: string,
) {
  const auth = createAuth(db, { nextCookies: false });
  const ctx = await auth.$context;
  // Older invite links for this person stop working.
  await db
    .delete(verifications)
    .where(
      and(eq(verifications.value, user.id), like(verifications.identifier, "reset-password:%")),
    );
  const token = randomToken(32);
  await ctx.internalAdapter.createVerificationValue({
    value: user.id,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  });
  const callback = encodeURIComponent("/reset-password?next=/admin/sign-in&invite=1");
  const url = `${ctx.baseURL}/reset-password/${token}?callbackURL=${callback}`;
  await sendAdminInviteEmail(db, { email: user.email, name: user.name, invitedBy, url });
}

export const inviteAdmin = adminAction(
  z
    .object({
      name: z.string().trim().min(1, "Enter a name").max(100),
      email: z.email("Enter a valid email address").max(200),
    })
    .strict(),
  { write: true, sensitive: true },
  async ({ name, email }, ctx) => {
    const db = await getDb();
    const normalized = email.toLowerCase().trim();
    const [existing] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(sql`lower(${users.email}) = ${normalized}`)
      .limit(1);
    if (existing) {
      throw new ActionError(
        existing.role === "admin"
          ? "This person is already an admin."
          : "This email belongs to a customer account. Use a different email for the admin account.",
        "VALIDATION",
        { email: ["Already in use."] },
      );
    }
    const auth = createAuth(db, { nextCookies: false });
    const authCtx = await auth.$context;
    const user = await authCtx.internalAdapter.createUser(
      {
        email: normalized,
        name,
        // Setting the password through the emailed link proves the address.
        emailVerified: true,
        role: "admin",
        isActive: true,
        invitedBy: ctx.user.id,
      },
      { method: "admin" },
    );
    await db
      .update(users)
      .set({ role: "admin", invitedBy: ctx.user.id })
      .where(eq(users.id, user.id));
    await sendInvite(db, { id: user.id, email: normalized, name }, ctx.user.name);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "admin.invite",
      entityType: "user",
      entityId: user.id,
      after: { email: normalized, name },
    });
    return { id: user.id };
  },
);

export const resendInvite = adminAction(
  z.object({ id: z.uuid() }),
  { write: true, sensitive: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const admin = await findAdmin(db, id);
    if (admin.lastLoginAt) throw new ActionError("This admin has already signed in.", "VALIDATION");
    await sendInvite(db, admin, ctx.user.name);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "admin.invite_resend",
      entityType: "user",
      entityId: id,
    });
    return { id };
  },
);

async function activeAdminCount(db: DbOrTx, except?: string) {
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.agencyId, currentAgencyId()),
        eq(users.role, "admin"),
        eq(users.isActive, true),
        eq(users.readOnly, false),
        except ? ne(users.id, except) : sql`true`,
      ),
    )) as [{ n: number }];
  return n;
}

/** Deactivated admins are signed out at once and cannot sign in (03 Admin users). */
export const setAdminActive = adminAction(
  z.object({ id: z.uuid(), active: z.boolean() }),
  { write: true, sensitive: true },
  async ({ id, active }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const admin = await findAdmin(tx, id);
      if (!active && !admin.readOnly && (await activeAdminCount(tx, id)) === 0) {
        throw new ActionError("You cannot deactivate the last active admin.", "LAST_ADMIN");
      }
      await tx.update(users).set({ isActive: active }).where(eq(users.id, id));
      if (!active) await tx.delete(sessions).where(eq(sessions.userId, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: active ? "admin.reactivate" : "admin.deactivate",
        entityType: "user",
        entityId: id,
        before: { isActive: admin.isActive },
        after: { isActive: active },
      });
    });
    return { id, active };
  },
);

/** For a lost phone: the admin sets up two-step verification again at the next sign-in. */
export const resetAdminTwoFactor = adminAction(
  z.object({ id: z.uuid() }),
  { write: true, sensitive: true },
  async ({ id }, ctx) => {
    if (id === ctx.user.id) {
      throw new ActionError("Ask another admin to reset your two-step verification.", "VALIDATION");
    }
    const db = await getDb();
    await db.transaction(async (tx) => {
      await findAdmin(tx, id);
      await tx.delete(twoFactors).where(eq(twoFactors.userId, id));
      await tx.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "admin.reset_2fa",
        entityType: "user",
        entityId: id,
      });
    });
    return { id };
  },
);

/**
 * Personal API token for MCP clients (10 §4). Shown once; only its SHA-256 hash is stored.
 * "propose" lets write tools prepare changes that an admin confirms in Propel.
 */
export const createApiToken = adminAction(
  z
    .object({
      name: z.string().trim().min(1, "Give the token a name").max(60),
      access: z.enum(["read", "propose"]),
      expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
    })
    .strict(),
  { write: true, sensitive: true },
  async ({ name, access, expiresInDays }, ctx) => {
    const token = `lnt_${randomToken(40)}`;
    const db = await getDb();
    const scopes = access === "propose" ? ["read", "propose"] : ["read"];
    const [row] = await db
      .insert(apiTokens)
      .values({
        userId: ctx.user.id,
        name,
        tokenHash: await sha256Hex(token),
        tokenPrefix: token.slice(0, 8),
        scopes,
        expiresAt: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
          : null,
      })
      .returning({ id: apiTokens.id });
    await writeAudit(db, {
      actor: ctx.actor,
      action: "api_token.create",
      entityType: "api_token",
      entityId: row!.id,
      after: { name, scopes, expiresInDays },
    });
    return { id: row!.id, token };
  },
);

export const revokeApiToken = adminAction(
  z.object({ id: z.uuid() }),
  { write: true, sensitive: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const [row] = await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), eq(apiTokens.agencyId, currentAgencyId())))
      .returning({ id: apiTokens.id, name: apiTokens.name });
    if (!row) throw new ActionError("This token no longer exists.", "NOT_FOUND");
    await writeAudit(db, {
      actor: ctx.actor,
      action: "api_token.revoke",
      entityType: "api_token",
      entityId: id,
      after: { name: row.name },
    });
    return { id };
  },
);
