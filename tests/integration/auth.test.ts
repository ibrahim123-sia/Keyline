import { beforeEach, describe, expect, it } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions, users } from "@/db/schema/auth";
import { auditLog, emailLog, jobRuns } from "@/db/schema/system";
import { createOrPromoteAdmin } from "@/features/admin-users/create-admin";
import { createAuth } from "@/lib/auth/config";
import { lockedUntil } from "@/lib/rate-limit";
import { runDueJobs } from "@/jobs/runner";
import { truncate } from "../helpers/db";
import { secretFromUri, totp } from "../helpers/totp";

async function auth() {
  return createAuth(await getDb(), { nextCookies: false });
}

/** Calls an auth endpoint and returns the status and parsed body (errors don't throw). */
async function call<T = Record<string, unknown>>(
  fn: (opts: { body: unknown; headers: Headers; asResponse: true }) => Promise<Response>,
  body: unknown,
  headers: Headers = new Headers(),
): Promise<{ status: number; body: T; cookies: string }> {
  let res: Response;
  try {
    res = await fn({ body, headers, asResponse: true });
  } catch (err) {
    // Errors thrown by `before` hooks reach auth.api callers as APIError (HTTP gets a response).
    const e = err as { statusCode?: number; body?: unknown };
    if (typeof e.statusCode !== "number") throw err;
    return { status: e.statusCode, body: (e.body ?? {}) as T, cookies: "" };
  }
  const text = await res.text();
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, cookies };
}

describe("customer sign-up and verification", () => {
  beforeEach(async () => {
    await truncate(
      "users",
      "sessions",
      "accounts",
      "verifications",
      "email_log",
      "job_runs",
      "rate_limits",
      "audit_log",
    );
  });

  it("creates a customer, ignores a self-assigned role and queues a verification email", async () => {
    const a = await auth();
    const res = await call(a.api.signUpEmail as never, {
      name: "Sara Khan",
      email: "Sara@Example.com",
      password: "a-long-passphrase-1",
      role: "admin",
    });
    // role is an `input: false` field: the request is rejected or the value ignored, never applied.
    const db = await getDb();
    const [u] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'sara@example.com'`);
    if (res.status === 200) {
      expect(u!.role).toBe("customer");
    } else {
      expect(u).toBeUndefined();
      const ok = await call(a.api.signUpEmail as never, {
        name: "Sara Khan",
        email: "Sara@Example.com",
        password: "a-long-passphrase-1",
      });
      expect(ok.status).toBe(200);
    }
    const [user] = await db.select().from(users).where(eq(users.email, "sara@example.com"));
    expect(user).toMatchObject({ role: "customer", emailVerified: false, isActive: true });

    const [mail] = await db.select().from(emailLog).where(eq(emailLog.to, "sara@example.com"));
    expect(mail).toMatchObject({ template: "auth.verify-email", status: "queued" });
    expect(mail!.html).toContain("/api/auth/verify-email?token=");
    expect(mail!.text).toContain("Confirm my email");

    // The email.send job runs and, with no provider configured, marks it as mocked.
    await runDueJobs();
    const [after] = await db.select().from(emailLog).where(eq(emailLog.id, mail!.id));
    expect(after!.status).toBe("mocked");
    const [job] = await db.select().from(jobRuns).where(eq(jobRuns.name, "email.send"));
    expect(job!.status).toBe("succeeded");
  });

  it("blocks sign-in until the email is verified, then allows it", async () => {
    const a = await auth();
    await call(a.api.signUpEmail as never, {
      name: "Omar",
      email: "omar@example.com",
      password: "a-long-passphrase-2",
    });
    const blocked = await call<{ code: string }>(a.api.signInEmail as never, {
      email: "omar@example.com",
      password: "a-long-passphrase-2",
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");

    // Follow the link from the logged email.
    const db = await getDb();
    const [mail] = await db.select().from(emailLog).orderBy(desc(emailLog.createdAt)).limit(1);
    const link = /href="([^"]*verify-email[^"]*)"/.exec(mail!.html!)![1]!.replaceAll("&amp;", "&");
    const token = new URL(link).searchParams.get("token")!;
    const verified = await a.api.verifyEmail({ query: { token }, asResponse: true });
    expect([200, 302]).toContain(verified.status);

    const ok = await call(a.api.signInEmail as never, {
      email: "omar@example.com",
      password: "a-long-passphrase-2",
    });
    expect(ok.status).toBe(200);
    expect(ok.cookies).toContain("propel.session_token=");
  });
});

describe("login protection", () => {
  beforeEach(async () => {
    await truncate(
      "users",
      "sessions",
      "accounts",
      "verifications",
      "email_log",
      "job_runs",
      "rate_limits",
      "audit_log",
    );
  });

  it("locks an email for 15 minutes after 5 wrong passwords", async () => {
    const db = await getDb();
    await createOrPromoteAdmin(db, {
      email: "locked@example.com",
      name: "Locked",
      password: "right-password-123",
    });
    const a = await auth();
    for (let i = 0; i < 5; i++) {
      const r = await call(a.api.signInEmail as never, {
        email: "locked@example.com",
        password: "wrong-password",
      });
      expect(r.status).toBe(401);
    }
    const until = await lockedUntil("login:locked@example.com");
    expect(until).not.toBeNull();
    expect(until!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);

    // Even the right password is refused while locked.
    const r = await call<{ code: string }>(a.api.signInEmail as never, {
      email: "locked@example.com",
      password: "right-password-123",
    });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe("LOCKED_OUT");
  });

  it("refuses deactivated accounts", async () => {
    const db = await getDb();
    const { id } = await createOrPromoteAdmin(db, {
      email: "gone@example.com",
      name: "Gone",
      password: "right-password-123",
    });
    await db.update(users).set({ isActive: false }).where(eq(users.id, id));
    const a = await auth();
    const r = await call<{ code: string }>(a.api.signInEmail as never, {
      email: "gone@example.com",
      password: "right-password-123",
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("ACCOUNT_DEACTIVATED");
  });
});

describe("admins", () => {
  beforeEach(async () => {
    await truncate(
      "users",
      "sessions",
      "accounts",
      "verifications",
      "two_factors",
      "email_log",
      "job_runs",
      "rate_limits",
      "audit_log",
    );
  });

  it("setup command creates a verified admin, audited, with a capped session", async () => {
    const db = await getDb();
    const { id, created } = await createOrPromoteAdmin(db, {
      email: "Owner@Agency.test",
      name: "Owner",
      password: "right-password-123",
    });
    expect(created).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ role: "admin", emailVerified: true, email: "owner@agency.test" });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entry).toMatchObject({ actorType: "system", action: "admin.create" });

    const a = await auth();
    const r = await call(a.api.signInEmail as never, {
      email: "owner@agency.test",
      password: "right-password-123",
    });
    expect(r.status).toBe(200);
    const [s] = await db.select().from(sessions).where(eq(sessions.userId, id));
    const hours = (s!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeLessThanOrEqual(12.01);
    expect(hours).toBeGreaterThan(11.9);
  });

  it("enrols TOTP and then requires the code at sign-in", async () => {
    const db = await getDb();
    const { id } = await createOrPromoteAdmin(db, {
      email: "totp@agency.test",
      name: "T",
      password: "right-password-123",
    });
    const a = await auth();
    const first = await call(a.api.signInEmail as never, {
      email: "totp@agency.test",
      password: "right-password-123",
    });
    const headers = new Headers({ cookie: first.cookies });

    const enabled = await call<{ totpURI: string; backupCodes: string[] }>(
      a.api.enableTwoFactor as never,
      { password: "right-password-123", method: "totp" },
      headers,
    );
    expect(enabled.status).toBe(200);
    expect(enabled.body.backupCodes).toHaveLength(10);
    const secret = secretFromUri(enabled.body.totpURI);

    const wrong = await call(a.api.verifyTOTP as never, { code: "000000" }, headers);
    expect(wrong.status).toBe(401);
    const ok = await call(a.api.verifyTOTP as never, { code: await totp(secret) }, headers);
    expect(ok.status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u!.twoFactorEnabled).toBe(true);

    // A fresh sign-in now stops at the second step...
    const second = await call<{ twoFactorRedirect?: boolean }>(a.api.signInEmail as never, {
      email: "totp@agency.test",
      password: "right-password-123",
    });
    expect(second.body.twoFactorRedirect).toBe(true);
    // ...and completes with a valid code.
    const done = await call(
      a.api.verifyTOTP as never,
      { code: await totp(secret) },
      new Headers({ cookie: second.cookies }),
    );
    expect(done.status).toBe(200);
    expect(done.cookies).toContain("propel.session_token=");
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(eq(sessions.userId, id)));
    expect(count[0]!.n).toBeGreaterThanOrEqual(2);
  });
});
