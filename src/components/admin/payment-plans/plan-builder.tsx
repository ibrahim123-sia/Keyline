"use client";

import { ChevronDownIcon, EyeIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  AdminField,
  NumberField,
  SelectField,
  TextInputField,
  TextareaField,
} from "@/components/admin/fields";
import { SortableList } from "@/components/admin/sortable-list";
import { PaymentPlanView, stageColors } from "@/components/payment-plan/plan-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { paymentPlanStages } from "@/db/schema/payment-plans";
import {
  formatPercent,
  newStepId,
  planTotalBasisPoints,
  stageLabels,
  suggestSummaryLabel,
  toBasisPoints,
  type PaymentPlanInput,
  type PlanStage,
  type PlanStep,
} from "@/features/payment-plans/schema";
import { planFromTemplate, type PlanTemplate } from "@/features/payment-plans/templates";
import { toMinor, type CurrencyFormat } from "@/lib/money";

const stepDefaults: Record<PlanStage, string> = {
  booking: "Down payment",
  construction: "During construction",
  handover: "On handover",
  post_handover: "After handover",
};

const nextStage = (last: PlanStage | undefined): PlanStage =>
  !last
    ? "booking"
    : last === "booking"
      ? "construction"
      : last === "construction"
        ? "handover"
        : "post_handover";

/** Nothing typed yet: a template can replace it without asking. */
function untouched(plan: PaymentPlanInput): boolean {
  const [only, ...rest] = plan.steps;
  return (
    rest.length === 0 &&
    !plan.name &&
    !plan.summaryLabel &&
    !plan.notes &&
    (!only ||
      (only.stage === "booking" &&
        only.label === stepDefaults.booking &&
        only.percent === 10 &&
        !only.timingText &&
        !only.dueDate &&
        !only.instalmentsCount))
  );
}

/**
 * Payment plan builder (07 §5): steps with stage, name, percent, timing, due date and
 * instalments; running total that must reach exactly 100%; templates; live preview.
 * `errorFor` takes paths inside the plan ("name", "steps", "steps.2.percent").
 */
export function PaymentPlanBuilder({
  value,
  onChange,
  templates,
  currency,
  price,
  errorFor = () => undefined,
}: {
  value: PaymentPlanInput;
  onChange: (next: PaymentPlanInput) => void;
  templates: PlanTemplate[];
  currency: CurrencyFormat;
  /** The listing's price in minor units, for amounts in the preview. */
  price?: number | null;
  errorFor?: (path: string) => string | undefined;
}) {
  const [pendingTemplate, setPendingTemplate] = useState<PlanTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [examplePrice, setExamplePrice] = useState<number | null>(null);
  const previewId = useId();

  const set = (patch: Partial<PaymentPlanInput>) => onChange({ ...value, ...patch });
  const setStep = (id: string, patch: Partial<PlanStep>) =>
    set({ steps: value.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const total = planTotalBasisPoints(value.steps);
  const suggestion = suggestSummaryLabel(value.steps);

  const applyTemplate = (t: PlanTemplate) => {
    const fresh = planFromTemplate(t);
    onChange({
      ...fresh,
      name: value.name || fresh.name,
      notes: value.notes,
    });
  };

  const addStep = () => {
    const last = value.steps.at(-1);
    const stage = nextStage(last?.stage);
    const left = 10_000 - total;
    set({
      steps: [
        ...value.steps,
        {
          id: newStepId(),
          stage,
          label: stepDefaults[stage],
          percent: left > 0 ? left / 100 : 10,
          timingText: "",
          dueDate: null,
          instalmentsCount: null,
        },
      ],
    });
  };

  const builtIn = templates.filter((t) => t.builtIn);
  const saved = templates.filter((t) => !t.builtIn);
  const previewPrice =
    price != null
      ? { amount: price, currency }
      : examplePrice
        ? { amount: toMinor(examplePrice, currency.decimals), currency }
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Start from a template <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            <DropdownMenuLabel>Built in</DropdownMenuLabel>
            {builtIn.map((t) => (
              <TemplateItem
                key={t.key}
                template={t}
                onSelect={() => (untouched(value) ? applyTemplate(t) : setPendingTemplate(t))}
              />
            ))}
            {saved.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Your templates</DropdownMenuLabel>
                {saved.map((t) => (
                  <TemplateItem
                    key={t.key}
                    template={t}
                    onSelect={() => (untouched(value) ? applyTemplate(t) : setPendingTemplate(t))}
                  />
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={showPreview}
          aria-controls={previewId}
          onClick={() => setShowPreview((v) => !v)}
        >
          <EyeIcon /> {showPreview ? "Hide preview" : "Preview"}
        </Button>
      </div>
      <ConfirmDialog
        open={pendingTemplate !== null}
        onOpenChange={(o) => !o && setPendingTemplate(null)}
        title={`Use “${pendingTemplate?.name ?? ""}”?`}
        description="Its steps replace the steps you have now."
        confirmLabel="Replace steps"
        onConfirm={() => {
          if (pendingTemplate) applyTemplate(pendingTemplate);
          setPendingTemplate(null);
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          label="Plan name"
          required
          maxLength={80}
          value={value.name}
          onChange={(name) => set({ name })}
          error={errorFor("name")}
        />
        <TextInputField
          label="Short label"
          maxLength={40}
          placeholder={suggestion || "e.g. 60/40"}
          description={
            suggestion
              ? `Shown on cards and in filters. Leave empty to use “${suggestion}”.`
              : "Shown on cards and in filters."
          }
          value={value.summaryLabel}
          onChange={(summaryLabel) => set({ summaryLabel })}
          error={errorFor("summaryLabel")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Steps</h3>
        <SortableList
          items={value.steps}
          onReorder={(steps) => set({ steps })}
          label={(s) => `Move step ${value.steps.indexOf(s) + 1}`}
          renderItem={(s) => {
            const i = value.steps.indexOf(s);
            const path = (field: string) => `steps.${i}.${field}`;
            return (
              <fieldset className="flex flex-col gap-3 py-2">
                <legend className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                  <span className={cn("size-2 rounded-full", stageColors[s.stage])} aria-hidden />
                  Step {i + 1}
                </legend>
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr_7rem]">
                  <SelectField
                    label="Stage"
                    value={s.stage}
                    onChange={(stage) => setStep(s.id, { stage })}
                    options={paymentPlanStages.map((v) => ({ value: v, label: stageLabels[v] }))}
                    error={errorFor(path("stage"))}
                  />
                  <TextInputField
                    label="Name"
                    maxLength={80}
                    value={s.label}
                    onChange={(label) => setStep(s.id, { label })}
                    error={errorFor(path("label"))}
                  />
                  <NumberField
                    label="Percent"
                    suffix="%"
                    min={0}
                    max={100}
                    step={0.01}
                    value={s.percent || null}
                    onChange={(percent) => setStep(s.id, { percent: percent ?? 0 })}
                    error={errorFor(path("percent"))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem_auto] sm:items-end">
                  <TextInputField
                    label="Timing"
                    maxLength={120}
                    placeholder="e.g. In 8 instalments to 2027"
                    value={s.timingText}
                    onChange={(timingText) => setStep(s.id, { timingText })}
                    error={errorFor(path("timingText"))}
                  />
                  <DueDateField
                    value={s.dueDate}
                    onChange={(dueDate) => setStep(s.id, { dueDate })}
                    error={errorFor(path("dueDate"))}
                  />
                  <NumberField
                    label="Instalments"
                    min={2}
                    max={600}
                    step={1}
                    placeholder="One"
                    value={s.instalmentsCount}
                    onChange={(instalmentsCount) => setStep(s.id, { instalmentsCount })}
                    error={errorFor(path("instalmentsCount"))}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-text-muted hover:text-danger"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={value.steps.length === 1}
                    onClick={() => set({ steps: value.steps.filter((x) => x.id !== s.id) })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </fieldset>
            );
          }}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={addStep}
            disabled={value.steps.length >= 30}
          >
            <PlusIcon /> Add step
          </Button>
        </div>
      </div>

      <PlanTotal steps={value.steps} total={total} error={errorFor("steps")} />

      <TextareaField
        label="Notes"
        rows={2}
        maxLength={1000}
        placeholder="e.g. Registration fees are due on booking."
        value={value.notes}
        onChange={(notes) => set({ notes })}
        error={errorFor("notes")}
      />

      {showPreview && (
        <div id={previewId} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          {price == null && (
            <NumberField
              label="Example price"
              description="Shows the amount of each step. Not saved."
              min={0}
              step={1000}
              suffix={currency.code}
              value={examplePrice}
              onChange={setExamplePrice}
            />
          )}
          <PaymentPlanView
            preview
            steps={value.steps}
            summaryLabel={value.summaryLabel}
            notes={value.notes}
            price={previewPrice}
          />
        </div>
      )}
    </div>
  );
}

function TemplateItem({ template, onSelect }: { template: PlanTemplate; onSelect: () => void }) {
  const label = template.summaryLabel || suggestSummaryLabel(template.steps);
  return (
    <DropdownMenuItem onSelect={onSelect} className="flex flex-col items-start gap-0.5">
      <span className="font-medium">{template.name}</span>
      <span className="text-[12px] text-text-muted">
        {template.steps.map((s) => `${formatPercent(toBasisPoints(s.percent))}%`).join(" · ")}
        {label && label !== template.name ? ` (${label})` : ""}
      </span>
    </DropdownMenuItem>
  );
}

function DueDateField({
  value,
  onChange,
  error,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <AdminField label="Due date" htmlFor={id} error={error}>
      <Input
        id={id}
        type="date"
        value={value ?? ""}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </AdminField>
  );
}

/** Running total against 100% (07 §5), announced as it changes. */
export function PlanTotal({
  steps,
  total,
  error,
}: {
  steps: PlanStep[];
  total: number;
  error?: string;
}) {
  const width = Math.max(total, 10_000);
  const status =
    total === 10_000
      ? "100%: complete"
      : total < 10_000
        ? `${formatPercent(total)}%: ${formatPercent(10_000 - total)}% left`
        : `${formatPercent(total)}%: ${formatPercent(total - 10_000)}% too much`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-ink">Total</span>
        <span
          role="status"
          className={cn(
            "font-semibold tabular",
            total === 10_000 ? "text-success" : total > 10_000 ? "text-danger" : "text-accent",
          )}
        >
          {status}
        </span>
      </div>
      <div
        className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-muted"
        aria-hidden
      >
        {steps.map((s) => (
          <div
            key={s.id}
            className={cn("h-full border-e-2 border-surface last:border-e-0", stageColors[s.stage])}
            style={{ width: `${(toBasisPoints(s.percent) / width) * 100}%` }}
          />
        ))}
        {total > 10_000 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-danger"
            style={{ left: `${(10_000 / width) * 100}%` }}
          />
        )}
      </div>
      {/* A total error from the last save stops applying once the steps add up. */}
      {error && total !== 10_000 && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
