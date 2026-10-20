"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./config";

export const authClient = createAuthClient({
  plugins: [
    // Navigation after a two-factor challenge is handled by the sign-in form itself.
    twoFactorClient(),
    inferAdditionalFields<Auth>(),
  ],
});

/** Better Auth error codes -> keys in the site dictionary (auth.errors). */
export function authErrorKey(
  error: { code?: string; status?: number; message?: string } | null | undefined,
):
  | "invalidCredentials"
  | "emailNotVerified"
  | "tooManyAttempts"
  | "deactivated"
  | "emailTaken"
  | "invalidCode"
  | "captcha"
  | "generic" {
  const code = error?.code ?? "";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD")
    return "invalidCredentials";
  if (code === "EMAIL_NOT_VERIFIED") return "emailNotVerified";
  if (code === "LOCKED_OUT" || error?.status === 429) return "tooManyAttempts";
  if (code === "ACCOUNT_DEACTIVATED") return "deactivated";
  if (code.startsWith("USER_ALREADY_EXISTS")) return "emailTaken";
  if (code.includes("INVALID_CODE") || code.includes("OTP") || code.includes("BACKUP_CODE"))
    return "invalidCode";
  if (code.includes("CAPTCHA")) return "captcha";
  return "generic";
}
