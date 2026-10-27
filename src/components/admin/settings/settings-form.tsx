"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SettingGroup } from "@/db/schema/system";
import { saveSettingsGroup } from "@/features/settings/actions";
import type { SettingsOf } from "@/features/settings/schema";
import { authClient } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";

export type SettingsFormApi<G extends SettingGroup> = {
  value: SettingsOf<G>;
  set: (patch: Partial<SettingsOf<G>>) => void;
  /** First error for a field path ("baseCurrency.code"), or anything inside it. */
  errorFor: (path: string) => string | undefined;
  readOnly: boolean;
};

/**
 * One Settings tab (04): edits a copy of the group, shows a save bar once something changed,
 * warns before leaving with unsaved changes, and maps validation errors to fields.
 */
export function SettingsForm<G extends SettingGroup>({
  group,
  initial,
  readOnly = false,
  children,
}: {
  group: G;
  initial: SettingsOf<G>;
  readOnly?: boolean;
  children: (api: SettingsFormApi<G>) => ReactNode;
}) {
  const formId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  const save = useAction((v: SettingsOf<G>) => saveSettingsGroup({ group, value: v }), {
    success: "Settings saved",
    onSuccess: (data) => {
      setSaved(data);
      setValue(data);
      router.refresh();
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const api: SettingsFormApi<G> = {
    value,
    set: (patch) => setValue((v) => ({ ...v, ...patch })),
    errorFor: save.errorUnder,
    readOnly,
  };

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-6 pb-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await save.run(value);
        setNeedsSignIn(!res.ok && res.code === "REAUTH_REQUIRED");
      }}
    >
      {children(api)}

      {needsSignIn && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-soft p-3 text-[13px]"
        >
          <span>
            For security, sign in again to change these settings. Your changes are kept on this page
            until you leave it.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await authClient.signOut();
              router.push(`/admin/sign-in?next=${encodeURIComponent(pathname)}`);
            }}
          >
            Sign in again
          </Button>
        </div>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          {dirty && (
            <span className="me-auto text-[13px] text-text-muted" role="status">
              Unsaved changes
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || save.pending}
            onClick={() => setValue(saved)}
          >
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || save.pending}>
            {save.pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
