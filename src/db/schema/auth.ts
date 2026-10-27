import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  jsonb,
  integer,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agencyColumn, idColumn, timestamps } from "./_common";

/**
 * Better Auth tables (user, session, account, verification, twoFactor, rateLimit),
 * plus the extra user columns from 05-data-model.md §1.
 */

export const userRoles = ["admin", "customer"] as const;
export type UserRole = (typeof userRoles)[number];

export type NotifyPrefs = {
  email?: Partial<
    Record<"newMatch" | "priceDrop" | "statusChange" | "tours" | "newsletter", boolean>
  >;
  whatsapp?: Partial<Record<"newMatch" | "priceDrop" | "statusChange" | "tours", boolean>>;
  /** Admin-only: which internal notifications this admin wants. */
  admin?: Partial<Record<string, boolean>>;
};

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    phone: text(),
    image: text(),
    role: text({ enum: userRoles }).notNull().default("customer"),
    isActive: boolean().notNull().default(true),
    /** Demo-only flag (16-seed-and-demo.md §3): can open every admin screen, writes are blocked. Not a role. */
    readOnly: boolean().notNull().default(false),
    twoFactorEnabled: boolean().notNull().default(false),
    adminTheme: text({ enum: ["light", "dark"] })
      .notNull()
      .default("light"),
    notifyPrefs: jsonb().$type<NotifyPrefs>().notNull().default({}),
    preferredContact: text({ enum: ["whatsapp", "call", "email"] }),
    marketingConsent: boolean().notNull().default(false),
    marketingConsentAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    invitedBy: uuid(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    index("users_role_idx").on(t.agencyId, t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: idColumn(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: idColumn(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: idColumn(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: idColumn(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [index("two_factors_user_idx").on(t.userId), index("two_factors_secret_idx").on(t.secret)],
);

/** Better Auth's own rate-limit storage (login and auth endpoints). */
export const authRateLimits = pgTable("auth_rate_limits", {
  id: idColumn(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/** Per-admin API tokens for the MCP server (10-ai.md §4). Only a SHA-256 hash is stored. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    tokenHash: text().notNull().unique(),
    tokenPrefix: text().notNull(),
    scopes: text()
      .array()
      .notNull()
      .default(sql`ARRAY['read','propose']::text[]`),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);
