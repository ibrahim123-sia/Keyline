import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { captcha, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  accounts,
  authRateLimits,
  sessions,
  twoFactors,
  users,
  verifications,
} from "@/db/schema/auth";
import { loadSettings } from "@/features/settings/queries";
import { env } from "@/lib/env";
import { newId } from "@/lib/ids";
import {
  clearKey,
  hit,
  lock,
  lockedUntil,
  rateLimitRules,
  rateLimitsDisabled,
} from "@/lib/rate-limit";
import { LOGIN_LOCKOUT_MINUTES, PASSWORD_MIN_LENGTH } from "./constants";
import { sendPasswordResetEmail, sendVerificationEmail } from "./emails";

export { LOGIN_LOCKOUT_MINUTES, PASSWORD_MIN_LENGTH };

export function captchaEnabled(): boolean {
  const key = env().TURNSTILE_SECRET_KEY;
  return Boolean(key) && key !== "off";
}

/**
 * Better Auth for both roles (03-roles-and-permissions.md):
 * - customers: email + password with verification, optional Google sign-in, 30-day sessions;
 * - admins: created by the setup command or by another admin, email + password + TOTP,
 *   12-hour sessions, never through public signup or social sign-in.
 *
 * Created per request on Workers (the database client is request-scoped there).
 */
export function createAuth(db: Db, options: { nextCookies?: boolean } = {}) {
  const e = env();
  const baseURL = e.BETTER_AUTH_URL ?? e.APP_URL;
  const googleConfigured = Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    appName: "Lintel",
    baseURL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL, baseURL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        twoFactor: twoFactors,
        rateLimit: authRateLimits,
      },
    }),
    advanced: {
      database: { generateId: () => newId() },
      cookiePrefix: "lintel",
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "customer", input: false },
        phone: { type: "string", required: false, input: true },
        isActive: { type: "boolean", required: false, defaultValue: true, input: false },
        readOnly: { type: "boolean", required: false, defaultValue: false, input: false },
        adminTheme: { type: "string", required: false, defaultValue: "light", input: false },
      },
    },
    session: {
      // Customers: 30 days with "remember me" (03 rules §6). Admins are capped at
      // `security.adminSessionHours` in the session hook below and in requireAdmin().
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail(db, { email: user.email, name: user.name, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(db, { email: user.email, name: user.name, url });
      },
    },
    socialProviders: googleConfigured
      ? {
          google: {
            clientId: e.GOOGLE_CLIENT_ID!,
            clientSecret: e.GOOGLE_CLIENT_SECRET!,
            prompt: "select_account",
          },
        }
      : {},
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    rateLimit: {
      enabled: !rateLimitsDisabled(),
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Anything created through a public endpoint (sign-up, Google) is a customer.
          // Admins are only created by trusted server code (no endpoint context).
          before: async (user, ctx) => {
            const data = { ...user, email: user.email.toLowerCase().trim() };
            if (ctx) Object.assign(data, { role: "customer", isActive: true, readOnly: false });
            return { data };
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const [u] = await db
              .select({ role: users.role, isActive: users.isActive })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!u || !u.isActive) {
              throw new APIError("FORBIDDEN", {
                message: "Account deactivated",
                code: "ACCOUNT_DEACTIVATED",
              });
            }
            if (u.role === "admin") {
              if (ctx?.path?.startsWith("/callback/") || ctx?.path?.startsWith("/sign-in/social")) {
                throw new APIError("FORBIDDEN", {
                  message: "Admins sign in with email and password",
                  code: "ADMIN_SOCIAL_NOT_ALLOWED",
                });
              }
              const security = await loadSettings("security", db);
              const cap = new Date(Date.now() + security.adminSessionHours * 60 * 60 * 1000);
              return {
                data: { ...session, expiresAt: session.expiresAt < cap ? session.expiresAt : cap },
              };
            }
            return { data: session };
          },
          after: async (session) => {
            await db
              .update(users)
              .set({ lastLoginAt: new Date() })
              .where(eq(users.id, session.userId));
          },
        },
      },
    },
    hooks: {
      // Login lockout (14 §2): 5 failed passwords for one email -> locked for 15 minutes.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/social" && googleConfigured) {
          const security = await loadSettings("security", db);
          if (!security.googleSignIn) {
            throw new APIError("FORBIDDEN", {
              message: "Google sign-in is turned off",
              code: "GOOGLE_DISABLED",
            });
          }
        }
        if (ctx.path !== "/sign-in/email") return;
        const email = normaliseEmail(ctx.body);
        if (email && (await lockedUntil(`login:${email}`, db))) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Too many attempts",
            code: "LOCKED_OUT",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email = normaliseEmail(ctx.body);
        if (!email) return;
        const returned = ctx.context.returned;
        if (returned instanceof APIError) {
          if (returned.statusCode === 401) {
            const r = await hit(`login-fail:${email}`, rateLimitRules.loginFailures, db);
            // The 5th failure in the window locks the email (not the 6th).
            if (r.count >= rateLimitRules.loginFailures.limit) {
              await lock(
                `login:${email}`,
                new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000),
                db,
              );
            }
          }
          return;
        }
        await clearKey(`login-fail:${email}`, db);
      }),
    },
    plugins: [
      twoFactor({
        issuer: "Lintel",
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10 },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: LOGIN_LOCKOUT_MINUTES * 60,
        },
      }),
      ...(captchaEnabled()
        ? [captcha({ provider: "cloudflare-turnstile", secretKey: e.TURNSTILE_SECRET_KEY })]
        : []),
      // Must be last: lets Server Actions set auth cookies. Off for scripts and tests.
      ...(options.nextCookies === false ? [] : [nextCookies()]),
    ],
  });
}

function normaliseEmail(body: unknown): string | null {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.includes("@") ? email.toLowerCase().trim() : null;
}

export type Auth = ReturnType<typeof createAuth>;
