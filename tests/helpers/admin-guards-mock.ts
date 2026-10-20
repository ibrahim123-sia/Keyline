import { AuthError, checkAdmin, type AdminCheck, type AdminContext } from "@/lib/permissions";
import { adminState } from "./admin-context";

/** Stand-in for lib/auth/guards.ts: same decisions (checkAdmin), user from adminState. */
export async function requireAdmin(check: AdminCheck = {}): Promise<AdminContext> {
  const user = adminState.user;
  const error = checkAdmin(
    user,
    user ? new Date() : null,
    { require2fa: true, adminSessionHours: 12, reauthMinutes: 15 },
    check,
  );
  if (error) throw new AuthError(error);
  return {
    user: user!,
    sessionId: "test-session",
    signedInAt: new Date(),
    actor: { type: "admin", id: user!.id },
  };
}

export const requireAdminPage = requireAdmin;
export async function getCurrentUser() {
  return adminState.user;
}
export async function requireCustomer() {
  if (!adminState.user) throw new AuthError("UNAUTHENTICATED");
  return adminState.user;
}
export const requireCustomerPage = requireCustomer;
export async function currentPath() {
  return "/admin";
}
