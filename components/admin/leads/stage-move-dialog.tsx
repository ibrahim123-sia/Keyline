"use client";

import { useState } from "react";
import { NumberField, SelectField, TextInputField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CurrencyFormat } from "@/lib/money";

export type StageChoice = { id: string; name: string; kind: "open" | "won" | "lost" };

const OTHER = "__other";

/**
 * Moving a lead to a Lost stage asks why; to a Won stage, the deal value (09 §4). Open stages
 * need nothing, so callers skip the dialog for them.
 */
export function StageMoveDialog({
  stage,
  count = 1,
  lostReasons,
  currency,
  onConfirm,
  onCancel,
}: {
  stage: StageChoice | null;
  count?: number;
  lostReasons: string[];
  currency: CurrencyFormat;
  onConfirm: (extra: { lostReason: string | null; dealValue: number | null }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [value, setValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // A new stage starts with an empty form.
  const [forStage, setForStage] = useState(stage?.id);
  if (forStage !== stage?.id) {
    setForStage(stage?.id);
    setReason("");
    setOther("");
    setValue(null);
    setError(undefined);
  }

  const lost = stage?.kind === "lost";
  const who = count === 1 ? "this lead" : `these ${count} leads`;
  async function submit() {
    const lostReason = reason === OTHER ? other.trim() : reason;
    if (lost && !lostReason) return setError("Choose a reason");
    if (!lost && value === null) return setError("Enter the deal value");
    setBusy(true);
    const ok = await onConfirm({
      lostReason: lost ? lostReason : null,
      dealValue: lost ? null : value,
    });
    setBusy(false);
    if (ok) onCancel();
  }

  return (
    <Dialog open={stage !== null && stage.kind !== "open"} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {lost ? `Why was ${who} lost?` : `${stage?.name ?? "Won"}: what was the deal worth?`}
          </DialogTitle>
          <DialogDescription>
            {lost
              ? "The reason is kept with the lead and shows in the reports."
              : `In ${currency.code}. It counts towards the deal value in the reports.`}
          </DialogDescription>
        </DialogHeader>
        {lost ? (
          <div className="flex flex-col gap-3">
            <SelectField
              label="Reason"
              value={reason}
              onChange={(v) => {
                setReason(v);
                setError(undefined);
              }}
              options={[
                ...lostReasons.map((r) => ({ value: r, label: r })),
                { value: OTHER, label: "Something else" },
              ]}
              error={reason !== OTHER ? error : undefined}
            />
            {reason === OTHER && (
              <TextInputField
                label="What happened"
                value={other}
                onChange={setOther}
                maxLength={120}
                error={error}
              />
            )}
          </div>
        ) : (
          <NumberField
            label="Deal value"
            value={value}
            onChange={(v) => {
              setValue(v);
              setError(undefined);
            }}
            min={0}
            suffix={currency.code}
            error={error}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {lost ? "Mark as lost" : "Mark as won"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
