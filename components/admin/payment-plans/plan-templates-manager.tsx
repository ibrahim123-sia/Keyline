"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { SidePanel } from "@/components/admin/side-panel";
import { stageColors } from "@/components/payment-plan/plan-view";
import { Button } from "@/components/ui/button";
import { deletePlanTemplate, savePlanTemplate } from "@/features/payment-plans/actions";
import {
  emptyPlan,
  formatPercent,
  suggestSummaryLabel,
  toBasisPoints,
  type PaymentPlanInput,
} from "@/features/payment-plans/schema";
import {
  builtInTemplates,
  planFromTemplate,
  type PlanTemplate,
} from "@/features/payment-plans/templates";
import type { CurrencyFormat } from "@/lib/money";
import { useAction } from "@/lib/use-action";
import { PaymentPlanBuilder } from "./plan-builder";

export type SavedTemplate = { id: string; plan: PaymentPlanInput; updatedAt: string };

type Editing = { id: string | null; plan: PaymentPlanInput };

const updatedFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

/** Setup -> Payment plans: built-in starting points and the agency's own templates. */
export function PlanTemplatesManager({
  templates,
  currency,
  readOnly,
}: {
  templates: SavedTemplate[];
  currency: CurrencyFormat;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);
  const save = useAction(savePlanTemplate, {
    success: "Template saved",
    onSuccess: () => {
      close();
      router.refresh();
    },
  });

  const savedAsTemplates: PlanTemplate[] = templates.map((t) => ({
    key: t.id,
    name: t.plan.name,
    summaryLabel: t.plan.summaryLabel,
    builtIn: false,
    steps: t.plan.steps,
  }));
  const allTemplates = [...builtInTemplates, ...savedAsTemplates];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${formId}-own`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${formId}-own`} className="text-[15px] font-semibold text-ink">
            Your templates
          </h2>
          {!readOnly && (
            <Button onClick={() => setEditing({ id: null, plan: emptyPlan() })}>
              <PlusIcon /> New template
            </Button>
          )}
        </div>
        {templates.length === 0 ? (
          <EmptyState
            title="No templates of your own yet"
            description="Save the plans you use often. They appear in the builder next to the built-in ones."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateCard
                  name={t.plan.name}
                  label={t.plan.summaryLabel}
                  steps={t.plan.steps}
                  meta={`Edited ${updatedFormat.format(new Date(t.updatedAt))}`}
                  onOpen={() => setEditing({ id: t.id, plan: structuredClone(t.plan) })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`${formId}-builtin`} className="flex flex-col gap-3">
        <div>
          <h2 id={`${formId}-builtin`} className="text-[15px] font-semibold text-ink">
            Built in
          </h2>
          <p className="text-[13px] text-text-muted">
            Always available in the builder. Open one to save an edited copy as your own.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {builtInTemplates.map((t) => (
            <li key={t.key}>
              <TemplateCard
                name={t.name}
                label={t.summaryLabel}
                steps={t.steps}
                meta="Built in"
                onOpen={
                  readOnly ? undefined : () => setEditing({ id: null, plan: planFromTemplate(t) })
                }
              />
            </li>
          ))}
        </ul>
      </section>

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && close()}
        title={editing?.id ? `Edit ${editing.plan.name || "template"}` : "New template"}
        description="Steps must add up to exactly 100%."
        footer={
          !readOnly && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {editing?.id && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" className="text-danger">
                        Delete
                      </Button>
                    }
                    title={`Delete ${editing.plan.name}?`}
                    description="Plans already made from it on listings and projects stay as they are."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deletePlanTemplate({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Template deleted");
                      close();
                      router.refresh();
                    }}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {editing && (
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ id: editing.id, data: editing.plan });
            }}
          >
            <PaymentPlanBuilder
              value={editing.plan}
              onChange={(plan) => setEditing((e) => (e ? { ...e, plan } : e))}
              templates={allTemplates.filter((t) => t.key !== editing.id)}
              currency={currency}
              errorFor={save.errorFor}
            />
          </form>
        )}
      </SidePanel>
    </div>
  );
}

function TemplateCard({
  name,
  label,
  steps,
  meta,
  onOpen,
}: {
  name: string;
  label: string;
  steps: PlanTemplate["steps"];
  meta: string;
  onOpen?: () => void;
}) {
  const shown = label || suggestSummaryLabel(steps);
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold text-ink">{name}</span>
        <span className="shrink-0 text-[12px] text-text-muted">{meta}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden>
        {steps.map((s, i) => (
          <div
            key={i}
            className={cn("h-full border-e-2 border-surface last:border-e-0", stageColors[s.stage])}
            style={{ width: `${toBasisPoints(s.percent) / 100}%` }}
          />
        ))}
      </div>
      <span className="text-[12.5px] text-text-muted tabular">
        {steps.map((s) => `${formatPercent(toBasisPoints(s.percent))}%`).join(" · ")}
        {shown && shown !== name ? ` · ${shown}` : ""}
      </span>
    </>
  );
  const className =
    "flex w-full flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-start";
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={cn(className, "transition-colors hover:border-ink/30 focus-visible:ring-2")}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
