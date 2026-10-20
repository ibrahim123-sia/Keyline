import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AuthError, type AdminCheck, type AdminContext } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth/guards";
import { admin } from "@/lib/i18n";
import type { ActionResult } from "./action-result";

export type { ActionResult } from "./action-result";

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

const authMessages: Record<string, string> = {
  UNAUTHENTICATED: "Please sign in again.",
  SESSION_EXPIRED: "Your session ended. Please sign in again.",
  FORBIDDEN: admin.errors.forbiddenText,
  TWO_FACTOR_REQUIRED: "Set up two-step verification first.",
  READ_ONLY: admin.readOnly.blocked,
  REAUTH_REQUIRED: admin.errors.reauthRequired,
};

export function toActionError(err: unknown): ActionResult<never> {
  unstable_rethrow(err); // redirect(), notFound() and other Next control flow
  if (err instanceof AuthError)
    return { ok: false, error: authMessages[err.code] ?? err.message, code: err.code };
  if (err instanceof ActionError) {
    return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  }
  console.error("[action] unexpected error", err);
  return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
}

export function validationError(error: z.ZodError): ActionResult<never> {
  const flat = z.flattenError(error);
  const fieldErrors: Record<string, string[]> = {};
  const entries = Object.entries(flat.fieldErrors as Record<string, string[] | undefined>);
  for (const [k, v] of entries) if (v && v.length) fieldErrors[k] = v;
  return {
    ok: false,
    error: flat.formErrors[0] ?? "Please check the highlighted fields.",
    code: "VALIDATION",
    fieldErrors,
  };
}

/**
 * Admin Server Action (01 §4): auth + permission first, then strict Zod validation, then the
 * handler (which writes the audit entry and revalidates cache tags).
 */
export function adminAction<S extends z.ZodType, R>(
  schema: S,
  check: AdminCheck,
  handler: (input: z.output<S>, ctx: AdminContext) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (input) => {
    try {
      const ctx = await requireAdmin(check);
      const parsed = schema.safeParse(input);
      if (!parsed.success) return validationError(parsed.error);
      return { ok: true, data: await handler(parsed.data, ctx) };
    } catch (err) {
      return toActionError(err);
    }
  };
}
