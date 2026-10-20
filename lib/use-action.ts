"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./action-result";

/**
 * Calls a Server Action from a client component: pending state, toast on success/error and
 * field errors for the form (14 §4: errors announced and linked to fields).
 */
export function useAction<I, O>(
  action: (input: I) => Promise<ActionResult<O>>,
  options: { success?: string | ((data: O) => string); onSuccess?: (data: O) => void } = {},
) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const { success, onSuccess } = options;

  const run = useCallback(
    (input: I) =>
      new Promise<ActionResult<O>>((resolve) => {
        startTransition(async () => {
          let res: ActionResult<O>;
          try {
            res = await action(input);
          } catch {
            res = {
              ok: false,
              error: "Could not reach the server. Your changes are still here; try again.",
            };
          }
          if (res.ok) {
            setFieldErrors({});
            const msg = typeof success === "function" ? success(res.data) : success;
            if (msg) toast.success(msg);
            onSuccess?.(res.data);
          } else {
            setFieldErrors(res.fieldErrors ?? {});
            toast.error(res.error);
          }
          resolve(res);
        });
      }),
    [action, success, onSuccess],
  );

  const errorFor = useCallback((field: string) => fieldErrors[field]?.[0], [fieldErrors]);
  return { run, pending, fieldErrors, errorFor, setFieldErrors };
}
