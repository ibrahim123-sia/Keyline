"use client";

import { cn } from "cn";
import { SwitchField, TextInputField, TextareaField } from "./fields";

export type SeoValues = {
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
};

/** Rough pixel width of a Google title (≈ 580 px fits on desktop). */
export function titlePixels(text: string): number {
  let px = 0;
  for (const ch of text) {
    if ("iljtfI.,;:!|' ".includes(ch)) px += 4.5;
    else if ("mwMW".includes(ch)) px += 14;
    else if (ch === ch.toUpperCase() && /[A-Z]/.test(ch)) px += 11;
    else px += 8.5;
  }
  return Math.round(px);
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const tone =
    value === 0
      ? "bg-border"
      : value > max
        ? "bg-danger"
        : pct > 85
          ? "bg-[#C9A227]"
          : "bg-success";
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11.5px] text-text-muted tabular">{label}</span>
    </div>
  );
}

/**
 * SEO block for any content item (08 §6): slug (editing creates a 301), title with a pixel
 * meter, description with a length meter, canonical, noindex and a Google result preview.
 */
export function SeoFields({
  values,
  onChange,
  urlPrefix,
  fallbackTitle,
  fallbackDescription,
  siteName,
  errorFor,
}: {
  values: SeoValues;
  onChange: (patch: Partial<SeoValues>) => void;
  /** Public path before the slug, e.g. "/buy/". */
  urlPrefix: string;
  fallbackTitle: string;
  fallbackDescription?: string;
  siteName: string;
  errorFor?: (field: string) => string | undefined;
}) {
  const title = values.seoTitle || fallbackTitle;
  const description = values.seoDescription || fallbackDescription || "";
  const px = titlePixels(title);
  return (
    <div className="flex flex-col gap-4">
      <TextInputField
        label="URL slug"
        description={`${urlPrefix}${values.slug || "…"} · changing it adds a 301 redirect from the old address.`}
        value={values.slug}
        onChange={(v) => onChange({ slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
        error={errorFor?.("slug")}
      />
      <div className="flex flex-col gap-1.5">
        <TextInputField
          label="SEO title"
          value={values.seoTitle ?? ""}
          placeholder={fallbackTitle}
          maxLength={120}
          onChange={(v) => onChange({ seoTitle: v || null })}
          error={errorFor?.("seoTitle")}
        />
        <Meter value={px} max={580} label={`${px} / 580 px`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <TextareaField
          label="Meta description"
          rows={3}
          value={values.seoDescription ?? ""}
          placeholder={fallbackDescription}
          onChange={(v) => onChange({ seoDescription: v || null })}
          description=" "
          error={errorFor?.("seoDescription")}
        />
        <Meter
          value={description.length}
          max={160}
          label={`${description.length} / 160 characters`}
        />
      </div>
      <div
        className="rounded-md border border-border bg-surface p-3"
        aria-label="Google result preview"
      >
        <p className="text-[12px] text-text-muted">
          {siteName} › {urlPrefix.replace(/^\/|\/$/g, "").replace(/\//g, " › ")}
        </p>
        <p className="mt-0.5 truncate text-[17px] leading-snug text-[#1a0dab]">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-[#4d5156]">
          {description || "Google will pick text from the page."}
        </p>
      </div>
      <TextInputField
        label="Canonical URL"
        description="Leave empty to use this page's own address."
        value={values.canonicalUrl ?? ""}
        type="url"
        onChange={(v) => onChange({ canonicalUrl: v || null })}
        error={errorFor?.("canonicalUrl")}
      />
      <SwitchField
        label="Hide from search engines (noindex)"
        checked={values.noindex}
        onChange={(v) => onChange({ noindex: v })}
      />
    </div>
  );
}
