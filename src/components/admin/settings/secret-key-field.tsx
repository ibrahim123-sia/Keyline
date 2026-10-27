"use client";

import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { actionErrorToast } from "@/components/admin/reauth-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isGeneratable, keyInfo } from "@/features/integrations/catalog";
import {
  generateIntegrationKey,
  removeIntegrationKey,
  saveIntegrationKey,
} from "@/features/integrations/actions";
import type { SecretKey } from "@/features/settings/schema";

export type KeyStatus = {
  key: SecretKey;
  isSet: boolean;
  masked: string;
  lastTestedAt: string | null;
  lastError: string | null;
};

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * One integration key (04 §8): saved encrypted on its own, shown masked, replaceable and
 * removable. Generated tokens are shown once so they can be pasted into the other service.
 */
export function SecretKeyField({
  status,
  onChange,
  readOnly,
}: {
  status: KeyStatus;
  onChange: (status: KeyStatus) => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const labelId = useId();
  const inputId = useId();
  const info = keyInfo[status.key];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const showInput = !status.isSet || editing;

  async function save() {
    if (!value.trim()) return;
    setBusy(true);
    const res = await saveIntegrationKey({ key: status.key, value });
    setBusy(false);
    if (!res.ok) return actionErrorToast(res, router);
    onChange(res.data);
    setValue("");
    setEditing(false);
    toast.success(`${info.label} saved`);
  }

  async function generate() {
    if (!isGeneratable(status.key)) return;
    setBusy(true);
    const res = await generateIntegrationKey({ key: status.key });
    setBusy(false);
    if (!res.ok) return actionErrorToast(res, router);
    onChange(res.data.status);
    setShown(res.data.value);
    setEditing(false);
  }

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <label id={labelId} htmlFor={inputId} className="text-[13px] font-semibold text-ink">
        {info.label}
      </label>
      {showInput ? (
        <div className="flex flex-wrap gap-2">
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={status.isSet ? "Paste the new key" : "Paste the key"}
            value={value}
            disabled={readOnly || busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // not the settings form around it
                void save();
              }
            }}
            className="min-w-56 flex-1 font-mono"
          />
          {!readOnly && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !value.trim()}
                onClick={() => void save()}
              >
                Save key
              </Button>
              {isGeneratable(status.key) && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void generate()}
                >
                  Generate
                </Button>
              )}
              {status.isSet && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setValue("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-soft px-2.5 py-1 font-mono text-[12.5px] text-ink">
            <KeyRoundIcon className="size-3.5 text-text-muted" aria-hidden />
            <span aria-label="Saved key, hidden">{status.masked}</span>
          </span>
          {!readOnly && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                Replace
              </Button>
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" className="text-danger">
                    Remove
                  </Button>
                }
                title={`Remove the ${info.label.toLowerCase()}?`}
                description="Anything that uses it stops working until a new one is saved."
                confirmLabel="Remove"
                destructive
                onConfirm={async () => {
                  const res = await removeIntegrationKey({ key: status.key });
                  if (!res.ok) return actionErrorToast(res, router);
                  onChange(res.data);
                  toast.success(`${info.label} removed`);
                }}
              />
            </>
          )}
        </div>
      )}
      {shown && (
        <div
          role="status"
          className="flex flex-col gap-1.5 rounded-md border border-accent/40 bg-accent-soft p-3 text-[13px]"
        >
          <span className="font-semibold text-ink">Copy it now: it is shown only this once.</span>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface px-2 py-1 font-mono text-[12.5px] break-all text-ink">
              {shown}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(shown)
                  .then(() => toast.success("Copied"))
                  .catch(() => toast.error("Could not copy"))
              }
            >
              <CopyIcon /> Copy
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShown(null)}>
              Done
            </Button>
          </div>
        </div>
      )}
      {status.isSet && status.lastError && (
        <p role="alert" className="text-[12.5px] text-danger">
          Last test failed
          {status.lastTestedAt ? ` (${when.format(new Date(status.lastTestedAt))})` : ""}:{" "}
          {status.lastError}
        </p>
      )}
      {status.isSet && !status.lastError && status.lastTestedAt && (
        <p className="text-[12.5px] text-success">
          Last test passed ({when.format(new Date(status.lastTestedAt))}).
        </p>
      )}
      {info.help && <p className="text-[12.5px] text-text-muted">{info.help}</p>}
    </div>
  );
}
