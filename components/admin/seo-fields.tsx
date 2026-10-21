"use client";

import { CheckCircle2Icon, CircleAlertIcon, CircleXIcon, ImageIcon } from "lucide-react";
import { cn } from "cn";
import {
  DESCRIPTION_MAX,
  TITLE_MAX_PX,
  seoChecklist,
  titlePixels,
  type ChecklistFacts,
  type CheckLevel,
} from "@/features/seo/checklist";
import { useHydrated } from "@/lib/use-hydrated";
import { SwitchField, TextInputField, TextareaField } from "./fields";
import { MediaPicker } from "./media/media-picker";

export { titlePixels };

export type SeoValues = {
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  /** Share image; omit to hide the picker. */
  ogImageId?: string | null;
};

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

const levelIcon: Record<CheckLevel, React.ReactNode> = {
  ok: <CheckCircle2Icon className="size-4 text-success" aria-hidden />,
  warn: <CircleAlertIcon className="size-4 text-[#B08A1E]" aria-hidden />,
  fail: <CircleXIcon className="size-4 text-danger" aria-hidden />,
};
const levelText: Record<CheckLevel, string> = { ok: "Good", warn: "Could be better", fail: "Fix" };

/**
 * SEO block for any content item (08 §6): slug (editing creates a 301), title with a pixel
 * meter, description with a length meter, Google result and share previews, canonical,
 * noindex and a checklist (title, description and whatever facts the screen passes).
 */
export function SeoFields({
  values,
  onChange,
  urlPrefix,
  fallbackTitle,
  fallbackDescription,
  siteName,
  errorFor,
  checklist,
  shareImageUrl,
}: {
  values: SeoValues;
  onChange: (patch: Partial<SeoValues>) => void;
  /** Public path before the slug, e.g. "/buy/". */
  urlPrefix: string;
  fallbackTitle: string;
  fallbackDescription?: string;
  siteName: string;
  errorFor?: (field: string) => string | undefined;
  /** Facts about the page for the checklist (H1, image alts, links, words). */
  checklist?: ChecklistFacts;
  /** The picture shares show when no share image is chosen (usually the cover photo). */
  shareImageUrl?: string | null;
}) {
  const hydrated = useHydrated();
  const host = hydrated ? window.location.host : "";
  const title = values.seoTitle || fallbackTitle;
  const description = values.seoDescription || fallbackDescription || "";
  const px = titlePixels(title);
  const checks = seoChecklist({ title, description, ...checklist });
  const path = `${urlPrefix}${values.slug}`;
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
        <Meter value={px} max={TITLE_MAX_PX} label={`${px} / ${TITLE_MAX_PX} px`} />
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
          max={DESCRIPTION_MAX}
          label={`${description.length} / ${DESCRIPTION_MAX} characters`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className="rounded-md border border-border bg-surface p-3"
          role="group"
          aria-label="Google result preview"
        >
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            Google
          </p>
          <p className="text-[12px] text-text-muted">
            {siteName} › {urlPrefix.replace(/^\/|\/$/g, "").replace(/\//g, " › ")}
          </p>
          <p className="mt-0.5 truncate text-[17px] leading-snug text-[#1a0dab]">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-[#4d5156]">
            {description || "Google will pick text from the page."}
          </p>
        </div>
        <div
          className="overflow-hidden rounded-md border border-border bg-[#f0f2f5]"
          role="group"
          aria-label="WhatsApp and Facebook share preview"
        >
          <p className="px-3 pt-2 text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            WhatsApp · Facebook
          </p>
          <div className="m-2 overflow-hidden rounded-md bg-white">
            {shareImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
              <img src={shareImageUrl} alt="" className="aspect-[1200/630] w-full object-cover" />
            ) : (
              <div className="flex aspect-[1200/630] w-full items-center justify-center bg-surface-muted text-text-muted">
                <ImageIcon className="size-6" aria-hidden />
                <span className="sr-only">No share image</span>
              </div>
            )}
            <div className="px-3 py-2">
              <p className="truncate text-[11.5px] text-[#65676b] uppercase">{host || siteName}</p>
              <p className="line-clamp-2 text-[14px] font-semibold text-[#050505]">{title}</p>
              <p className="line-clamp-1 text-[12.5px] text-[#65676b]">{description || path}</p>
            </div>
          </div>
        </div>
      </div>

      {values.ogImageId !== undefined && (
        <MediaPicker
          label="Share image"
          description="Shown when the page is shared on WhatsApp or social media. The share crop (1200×630) is used; without one, the preview's picture is used."
          value={values.ogImageId}
          onChange={(id) => onChange({ ogImageId: id })}
          error={errorFor?.("ogImageId")}
        />
      )}
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

      <div role="group" aria-label="SEO checklist" className="rounded-md border border-border">
        <p className="border-b border-border px-3 py-2 text-[12.5px] font-semibold text-ink">
          SEO checklist
        </p>
        <ul className="divide-y divide-border">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 px-3 py-2 text-[12.5px]">
              {levelIcon[c.level]}
              <span className="min-w-0">
                <span className="font-medium text-ink">{c.label}</span>
                <span className="sr-only"> ({levelText[c.level]})</span>
                <span className="text-text-muted"> · {c.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
