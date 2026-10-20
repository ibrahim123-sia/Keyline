"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { contrastRatio } from "@/lib/contrast";

/**
 * Admin form fields: label + control + help + error with the right aria wiring
 * (14 §4: errors announced and linked to fields). Controlled components.
 */
export function AdminField({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
  inline,
}: {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Label and control on one row (switches). */
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        inline ? "flex items-center justify-between gap-4" : "flex flex-col gap-1.5",
        className,
      )}
    >
      <div className={cn(inline && "min-w-0")}>
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}
          {required && (
            <span className="ms-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
        {inline && description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      </div>
      {children}
      {!inline && description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type Base = {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
};

export function TextInputField({
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  maxLength,
  disabled,
  suggestions,
  ...base
}: Base & {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email" | "url" | "tel" | "password";
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
  /** Values offered while typing (a native datalist). */
  suggestions?: string[];
}) {
  const id = useId();
  const listId = `${id}-suggestions`;
  return (
    <AdminField {...base} htmlFor={id}>
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        list={suggestions && suggestions.length > 0 ? listId : undefined}
        aria-invalid={base.error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </AdminField>
  );
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder,
  ...base
}: Base & {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <AdminField {...base} htmlFor={id}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          aria-invalid={base.error ? true : undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="tabular"
        />
        {suffix && <span className="shrink-0 text-[13px] text-text-muted">{suffix}</span>}
      </div>
    </AdminField>
  );
}

export function TextareaField({
  value,
  onChange,
  rows = 4,
  maxLength,
  placeholder,
  ...base
}: Base & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <AdminField
      {...base}
      htmlFor={id}
      description={
        base.description ?? (maxLength ? `${value.length} / ${maxLength} characters` : undefined)
      }
    >
      <Textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={base.error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </AdminField>
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  ...base
}: Base & {
  value: T | "" | null;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <AdminField {...base} htmlFor={id}>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full" aria-invalid={base.error ? true : undefined}>
          <SelectValue placeholder={placeholder ?? "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </AdminField>
  );
}

export function SwitchField({
  checked,
  onChange,
  disabled,
  ...base
}: Base & { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <AdminField {...base} htmlFor={id} inline>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </AdminField>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Colour picker + hex input, with an optional live contrast check against a background. */
export function ColorField({
  value,
  onChange,
  contrastWith,
  minContrast = 4.5,
  ...base
}: Base & {
  value: string;
  onChange: (v: string) => void;
  contrastWith?: string;
  minContrast?: number;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const ratio =
    contrastWith && HEX.test(value) && HEX.test(contrastWith)
      ? contrastRatio(value, contrastWith)
      : null;
  return (
    <AdminField {...base} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Pick colour"
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={text}
          maxLength={7}
          className="w-28 font-mono uppercase"
          aria-invalid={base.error || !HEX.test(text) ? true : undefined}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (HEX.test(v)) onChange(v.toUpperCase());
          }}
        />
        {ratio !== null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-semibold tabular",
              ratio >= minContrast ? "bg-success-soft text-success" : "bg-danger/10 text-danger",
            )}
          >
            {ratio.toFixed(2)}:1
          </span>
        )}
      </div>
    </AdminField>
  );
}

/** Editable list of short strings (lead types, lost reasons, ownership types...). */
export function ListField({
  value,
  onChange,
  placeholder = "Add an item",
  max = 50,
  suggestions,
  ...base
}: Base & {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  /** Offered while typing (a native datalist); anything else can still be added. */
  suggestions?: string[];
}) {
  const id = useId();
  const listId = `${id}-suggestions`;
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || value.includes(v) || value.length >= max) return;
    onChange([...value, v]);
    setDraft("");
  };
  return (
    <AdminField {...base} htmlFor={id}>
      <div className="flex flex-col gap-2">
        {value.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {value.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-soft py-0.5 ps-2.5 pe-1 text-[12.5px] text-ink"
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => onChange(value.filter((x) => x !== item))}
                  className="rounded-full p-0.5 text-text-muted hover:bg-surface-muted hover:text-ink"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {suggestions && (
            <datalist id={listId}>
              {suggestions
                .filter((x) => !value.includes(x))
                .map((x) => (
                  <option key={x} value={x} />
                ))}
            </datalist>
          )}
          <Input
            id={id}
            value={draft}
            placeholder={placeholder}
            list={suggestions ? listId : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
            <PlusIcon /> Add
          </Button>
        </div>
      </div>
    </AdminField>
  );
}

/** Checkbox list for picking several options (facilities, areas...). */
export function CheckboxListField<T extends string>({
  value,
  onChange,
  options,
  columns = 2,
  ...base
}: Base & {
  value: T[];
  onChange: (v: T[]) => void;
  options: Array<{ value: T; label: string }>;
  columns?: 1 | 2 | 3;
}) {
  return (
    <AdminField {...base}>
      <div
        className={cn(
          "grid gap-x-4 gap-y-1.5",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
        role="group"
      >
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              checked={value.includes(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value),
                )
              }
            />
            {o.label}
          </label>
        ))}
      </div>
    </AdminField>
  );
}
