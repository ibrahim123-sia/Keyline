import type { UserRole } from "@/db/schema/auth";
import type { AuditActor } from "@/lib/audit";

/**
 * Permission table (03-roles-and-permissions.md). Checked on the server for every page,
 * action, route handler and AI tool; hiding a button is not security.
 */
export type Role = UserRole | "guest";

export const permissions = {
  "site.browse": ["guest", "customer", "admin"],
  "tools.use": ["guest", "customer", "admin"],
  "compare.use": ["guest", "customer", "admin"],
  "chat.use": ["guest", "customer", "admin"],
  "forms.submit": ["guest", "customer", "admin"],
  "listing.request": ["guest", "customer", "admin"],
  "saved.manage": ["customer", "admin"],
  "account.ownRecords": ["customer"],
  "profile.edit": ["customer", "admin"],
  "admin.access": ["admin"],
  "admin.write": ["admin"],
  "admin.assistant": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly Role[]).includes(role);
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: UserRole;
  phone: string | null;
  isActive: boolean;
  readOnly: boolean;
  twoFactorEnabled: boolean;
  adminTheme: "light" | "dark";
};

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "TWO_FACTOR_REQUIRED"
  | "READ_ONLY"
  | "REAUTH_REQUIRED";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AuthError";
  }
}

export type AdminContext = {
  user: SessionUser;
  sessionId: string;
  signedInAt: Date;
  actor: AuditActor;
};

export type AdminCheck = {
  /** Mutations: blocked for the read-only demo viewer. */
  write?: boolean;
  /** Adding admins, changing integrations/security: needs a recent sign-in (03 rules §6). */
  sensitive?: boolean;
  /** The 2FA setup screen itself must be reachable before 2FA is on. */
  allowWithoutTwoFactor?: boolean;
};

export type SecurityPolicy = {
  require2fa: boolean;
  adminSessionHours: number;
  reauthMinutes: number;
};

/** Pure decision used by requireAdmin(); unit-tested without a request. */
export function checkAdmin(
  user: SessionUser | null,
  signedInAt: Date | null,
  policy: SecurityPolicy,
  check: AdminCheck = {},
  now: Date = new Date(),
): AuthErrorCode | null {
  if (!user || !signedInAt) return "UNAUTHENTICATED";
  if (user.role !== "admin" || !user.isActive) return "FORBIDDEN";
  const age = now.getTime() - signedInAt.getTime();
  if (age > policy.adminSessionHours * 3_600_000) return "SESSION_EXPIRED";
  if (policy.require2fa && !user.twoFactorEnabled && !check.allowWithoutTwoFactor)
    return "TWO_FACTOR_REQUIRED";
  if (check.write && user.readOnly) return "READ_ONLY";
  if (check.sensitive && age > policy.reauthMinutes * 60_000) return "REAUTH_REQUIRED";
  return null;
}

export function toSessionUser(raw: Record<string, unknown>): SessionUser {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    emailVerified: Boolean(raw.emailVerified),
    image: (raw.image as string | null | undefined) ?? null,
    role: raw.role === "admin" ? "admin" : "customer",
    phone: (raw.phone as string | null | undefined) ?? null,
    isActive: raw.isActive !== false,
    readOnly: raw.readOnly === true,
    twoFactorEnabled: raw.twoFactorEnabled === true,
    adminTheme: raw.adminTheme === "dark" ? "dark" : "light",
  };
}
