import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "./constants";

/** Form schemas shared by the client forms (Better Auth validates again on the server). */

const email = z.email("Enter a valid email address").trim().toLowerCase();

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
  rememberMe: z.boolean(),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email,
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d][\d\s().-]*$/, "Use digits, spaces and an optional +")
    .or(z.literal("")),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(128),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The passwords don't match",
    path: ["confirm"],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const totpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
  trustDevice: z.boolean(),
});
export type TotpValues = z.infer<typeof totpSchema>;

export const backupCodeSchema = z.object({
  code: z.string().trim().min(6, "Enter a backup code").max(40),
});

/** Only same-site relative paths are allowed as "next" targets (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
