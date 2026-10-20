import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiTokens, sessions, twoFactors, users, verifications } from "@/db/schema/auth";
import { emailLog } from "@/db/schema/system";
import {
  createApiToken,
  inviteAdmin,
  resendInvite,
  resetAdminTwoFactor,
  revokeApiToken,
  setAdminActive,
} from "@/features/admin-users/manage";
import { listAdmins, listApiTokens } from "@/features/admin-users/queries";
import { createAuth } from "@/lib/auth/config";
import { sha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

async function seedAdmin(
  id: string,
  email: string,
  extra: Partial<typeof users.$inferInsert> = {},
) {
  const db = await getDb();
  await db.insert(users).values({
    id,
    email,
    name: email.split("@")[0]!,
    emailVerified: true,
    role: "admin",
    ...extra,
  });
}

const tokenFrom = (html: string) => /reset-password\/([a-z0-9]+)\?/.exec(html)?.[1] ?? null;

describe("admin users", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    adminState.signedInAt = undefined;
    await truncate(
      "users",
      "sessions",
      "accounts",
      "verifications",
      "two_factors",
      "api_tokens",
      "email_log",
      "job_runs",
      "audit_log",
    );
    await seedAdmin(testAdmin.id, testAdmin.email, { lastLoginAt: new Date() });
  });

  it("invites by email with a week-long link that sets the password", async () => {
    const res = await inviteAdmin({ name: "Sara Khan", email: "Sara@Agency.example" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, res.data.id));
    expect(user).toMatchObject({
      email: "sara@agency.example",
      role: "admin",
      invitedBy: testAdmin.id,
      isActive: true,
    });
    expect((await listAdmins()).find((a) => a.id === res.data.id)?.pending).toBe(true);

    const [mail] = await db
      .select()
      .from(emailLog)
      .where(eq(emailLog.template, "auth.admin-invite"));
    expect(mail!.to).toBe("sara@agency.example");
    const token = tokenFrom(mail!.html ?? "");
    expect(token).toBeTruthy();
    expect(mail!.html).toContain(
      encodeURIComponent("/reset-password?next=/admin/sign-in&invite=1"),
    );
    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, `reset-password:${token}`));
    const days = (verification!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);

    // The link works with Better Auth's reset: the invited admin can then sign in.
    const auth = createAuth(db, { nextCookies: false });
    await auth.api.resetPassword({
      body: { newPassword: "harbour-lantern-meadow-77", token: token! },
    });
    const signIn = await auth.api.signInEmail({
      body: { email: "sara@agency.example", password: "harbour-lantern-meadow-77" },
    });
    expect(signIn.user.id).toBe(res.data.id);
  });

  it("refuses emails that are already admins or customers, and resends with a fresh link", async () => {
    await seedAdmin(newId(), "taken@agency.example");
    const db = await getDb();
    await db
      .insert(users)
      .values({ id: newId(), email: "buyer@mail.example", name: "Buyer", role: "customer" });
    expect(await inviteAdmin({ name: "X", email: "taken@agency.example" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(await inviteAdmin({ name: "Y", email: "buyer@mail.example" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });

    const res = await inviteAdmin({ name: "Omar", email: "omar@agency.example" });
    if (!res.ok) throw new Error(res.error);
    expect(await resendInvite({ id: res.data.id })).toMatchObject({ ok: true });
    const tokens = await db
      .select()
      .from(verifications)
      .where(like(verifications.identifier, "reset-password:%"));
    expect(tokens).toHaveLength(1); // the first link no longer works
  });

  it("never deactivates the last active admin; deactivating signs the person out", async () => {
    expect(await setAdminActive({ id: testAdmin.id, active: false })).toMatchObject({
      ok: false,
      code: "LAST_ADMIN",
    });

    const other = newId();
    await seedAdmin(other, "second@agency.example");
    const db = await getDb();
    await db.insert(sessions).values({
      id: newId(),
      userId: other,
      token: "tok-second",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect(await setAdminActive({ id: other, active: false })).toMatchObject({ ok: true });
    expect(await db.select().from(sessions).where(eq(sessions.userId, other))).toHaveLength(0);
    // Now the current admin is the last active one again.
    expect(await setAdminActive({ id: testAdmin.id, active: false })).toMatchObject({
      ok: false,
      code: "LAST_ADMIN",
    });
    expect(await setAdminActive({ id: other, active: true })).toMatchObject({ ok: true });
  });

  it("resets another admin's two-step verification, not your own", async () => {
    const other = newId();
    await seedAdmin(other, "lostphone@agency.example", { twoFactorEnabled: true });
    const db = await getDb();
    await db
      .insert(twoFactors)
      .values({ id: newId(), userId: other, secret: "enc-secret", backupCodes: "enc-codes" });
    expect(await resetAdminTwoFactor({ id: testAdmin.id })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(await resetAdminTwoFactor({ id: other })).toMatchObject({ ok: true });
    expect(await db.select().from(twoFactors).where(eq(twoFactors.userId, other))).toHaveLength(0);
    const [user] = await db.select().from(users).where(eq(users.id, other));
    expect(user!.twoFactorEnabled).toBe(false);
  });

  it("API tokens are shown once, stored hashed and can be revoked", async () => {
    const res = await createApiToken({ name: "Claude", access: "propose", expiresInDays: 90 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.token).toMatch(/^lnt_[a-z0-9]{40}$/);
    const db = await getDb();
    const [row] = await db.select().from(apiTokens);
    expect(row!.tokenHash).toBe(await sha256Hex(res.data.token));
    expect(row!.tokenPrefix).toBe(res.data.token.slice(0, 8));
    expect(row!.scopes).toEqual(["read", "propose"]);
    expect(JSON.stringify(await listApiTokens())).not.toContain(res.data.token);

    expect(await revokeApiToken({ id: res.data.id })).toMatchObject({ ok: true });
    expect((await listApiTokens())[0]!.revokedAt).not.toBeNull();
  });

  it("needs a recent sign-in", async () => {
    adminState.signedInAt = new Date(Date.now() - 60 * 60 * 1000);
    expect(await inviteAdmin({ name: "Late", email: "late@agency.example" })).toMatchObject({
      ok: false,
      code: "REAUTH_REQUIRED",
    });
    expect(await createApiToken({ name: "x", access: "read", expiresInDays: 30 })).toMatchObject({
      ok: false,
      code: "REAUTH_REQUIRED",
    });
  });
});
