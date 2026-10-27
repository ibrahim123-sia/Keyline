import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "@/features/settings/queries";
import {
  AuthError,
  checkAdmin,
  toSessionUser,
  type AdminCheck,
  type AdminContext,
  type SessionUser,
} from "@/lib/permissions";
import { getSession } from "./server";

/** Signed-in user (any role) or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session ? toSessionUser(session.user as Record<string, unknown>) : null;
}

/** For Server Actions and route handlers: throws AuthError (see lib/actions.ts). */
export async function requireAdmin(check: AdminCheck = {}): Promise<AdminContext> {
  const session = await getSession();
  const user = session ? toSessionUser(session.user as Record<string, unknown>) : null;
  const signedInAt = session ? new Date(session.session.createdAt) : null;
  const security = await getSettings("security");
  const error = checkAdmin(user, signedInAt, security, check);
  if (error) throw new AuthError(error);
  return {
    user: user!,
    sessionId: session!.session.id,
    signedInAt: signedInAt!,
    actor: { type: "admin", id: user!.id },
  };
}

/** Path of the current request (set by middleware.ts) for "come back here after sign-in". */
export async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get("x-propel-path") ?? "/admin";
}

/** For admin pages and layouts: redirects instead of throwing. */
export async function requireAdminPage(check: AdminCheck = {}): Promise<AdminContext> {
  try {
    return await requireAdmin(check);
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    const next = encodeURIComponent(await currentPath());
    switch (err.code) {
      case "TWO_FACTOR_REQUIRED":
        redirect("/admin/setup-2fa");
      case "FORBIDDEN":
        redirect(`/admin/sign-in?error=forbidden`);
      case "SESSION_EXPIRED":
      case "REAUTH_REQUIRED":
        redirect(`/admin/sign-in?error=expired&next=${next}`);
      default:
        redirect(`/admin/sign-in?next=${next}`);
    }
  }
}

/** Customer area pages: any signed-in user with a verified email. */
export async function requireCustomerPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(await currentPath())}`);
  if (!user.isActive) redirect("/sign-in?error=deactivated");
  return user;
}

/** Customer Server Actions: throws AuthError. Every query must still filter by user.id (03 rule 2). */
export async function requireCustomer(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (!user.isActive) throw new AuthError("FORBIDDEN");
  return user;
}
