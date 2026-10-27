"use client";

import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import type { ActionResult } from "@/lib/action-result";

/**
 * Error toast for a failed admin action. When the action needs a recent sign-in, the toast
 * offers to sign in again and come back to this page (03 rules: re-login for sensitive actions).
 */
export function actionErrorToast(
  res: Extract<ActionResult<unknown>, { ok: false }>,
  router: { push: (href: string) => void },
): void {
  if (res.code === "REAUTH_REQUIRED") {
    toast.error(res.error, {
      action: {
        label: "Sign in again",
        onClick: async () => {
          await authClient.signOut();
          router.push(`/admin/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        },
      },
    });
    return;
  }
  toast.error(res.error);
}
