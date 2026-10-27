"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { admin, site } from "@/lib/i18n";
import { FormAlert } from "./auth-card";

/** Messages for ?error=… on the sign-in pages. */
export function SignInNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  if (!error) return null;

  if (error === "forbidden") {
    return (
      <div className="mb-5 flex flex-col gap-3">
        <FormAlert>{admin.errors.forbiddenText}</FormAlert>
        <Button
          variant="outline-site"
          size="md"
          onClick={async () => {
            await authClient.signOut();
            router.replace("/admin/sign-in");
            router.refresh();
          }}
        >
          {site.header.signOut}
        </Button>
      </div>
    );
  }
  const message =
    error === "expired"
      ? "Your session ended. Please sign in again."
      : error === "deactivated"
        ? site.auth.errors.deactivated
        : site.auth.errors.generic;
  return (
    <div className="mb-5">
      <FormAlert tone="info">{message}</FormAlert>
    </div>
  );
}
