"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { cn } from "cn";
import { compactMoney, pluralType, searchChips, type SearchLabels } from "@/features/search/labels";
import type { SearchOptions } from "@/features/search/page-data";
import {
  searchHref,
  searchSorts,
  type SearchFilters,
  type SearchSort,
} from "@/features/search/params";
import type { Rates } from "@/lib/currency-display";
import { format } from "@/lib/i18n";
import { search as t } from "@/lib/i18n/dictionaries/search";
import type { CurrencyFormat } from "@/lib/money";
import { areaUnitLabels, type AreaUnit } from "@/lib/units";
import {
  BedsField,
  FilterPopover,
  FilterSheet,
  FiltersButton,
  PriceFields,
  TypesField,
  type FilterContext,
} from "./filter-controls";
import { LocationSearch } from "./location-search";

/**
 * Search filter bar (06 §4.1-4.2): purpose tabs, location autocomplete, type / price / beds
 * popovers and "More filters" on desktop; location and a full-screen "Filters" sheet on
 * phones. Every change becomes a URL, so searches can be shared and saved.
 */
export function FilterBar({
  filters: f,
  labels,
  options,
  currency,
  visitor,
  areaUnit,
}: {
  filters: SearchFilters;
  labels: SearchLabels;
  options: SearchOptions;
  currency: CurrencyFormat;
  visitor: { code: string; rates: Rates };
  areaUnit: AreaUnit;
  total: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const sortId = useId();
  const ctx: FilterContext = { options, labels, currency, visitor, areaUnit };
  const go = (next: SearchFilters, replace = false) =>
    start(() => {
      const href = searchHref({ ...next, page: next.page ?? 1 });
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });

  const offPlan = f.purpose === "sale" && f.completion === "off_plan";
  const tabs = [
    {
      label: t.purpose.sale,
      on: f.purpose === "sale" && !offPlan,
      next: { ...f, purpose: "sale" as const, completion: null, cheques: null },
    },
    {
      label: t.purpose.rent,
      on: f.purpose === "rent",
      next: { ...f, purpose: "rent" as const, completion: null, handover: null, plan: null },
    },
    {
      label: t.purpose.offPlan,
      on: offPlan,
      next: { ...f, purpose: "sale" as const, completion: "off_plan" as const, cheques: null },
    },
  ];
  const selected = f.loc.map((value) => ({ value, label: labels.places[value] ?? value }));
  const chips = searchChips(f, labels, { currency, areaUnit });
  const moreCount = chips.filter((c) => !c.key.startsWith("loc:")).length;

  const typeSummary =
    f.type.length === 0
      ? null
      : f.type.length === 1
        ? pluralType(labels.types[f.type[0]!] ?? f.type[0]!)
        : `${t.filters.type} (${f.type.length})`;
  const priceSummary =
    f.min === null && f.max === null
      ? null
      : f.min !== null && f.max !== null
        ? `${compactMoney(f.min, currency)} – ${compactMoney(f.max, currency)}`
        : f.min !== null
          ? `${compactMoney(f.min, currency)}+`
          : `≤ ${compactMoney(f.max!, currency)}`;
  const bedsSummary =
    f.beds.length === 0
      ? null
      : f.beds.map((b) => (b === 0 ? t.filters.studio : b === 5 ? "5+" : String(b))).join(", ") +
        ` · ${t.filters.beds.toLowerCase()}`;

  return (
    <div className={cn("flex flex-col gap-3", pending && "opacity-80")} aria-busy={pending}>
      <nav aria-label={t.purpose.label} className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-border bg-surface p-1">
          {tabs.map((tab) => (
            <a
              key={tab.label}
              href={searchHref({ ...tab.next, page: 1 })}
              aria-current={tab.on ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                go({ ...tab.next, page: 1 });
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-[14px] font-medium",
                tab.on ? "bg-ink text-surface" : "text-ink hover:bg-surface-muted",
              )}
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <LocationSearch
          className="w-full lg:w-auto lg:min-w-[22rem] lg:flex-1"
          selected={selected}
          onAdd={(value) => go({ ...f, loc: [...f.loc, value], page: 1 })}
          onRemove={(value) => go({ ...f, loc: f.loc.filter((v) => v !== value), page: 1 })}
        />
        <div className="hidden items-center gap-2 lg:flex">
          {options.types.length > 0 && (
            <FilterPopover label={t.filters.type} summary={typeSummary} filters={f} onApply={go}>
              {(draft, set) => <TypesField f={draft} set={set} ctx={ctx} />}
            </FilterPopover>
          )}
          <FilterPopover
            label={t.filters.price}
            summary={priceSummary}
            filters={f}
            onApply={go}
            wide
          >
            {(draft, set) => <PriceFields f={draft} set={set} ctx={ctx} />}
          </FilterPopover>
          <FilterPopover label={t.filters.beds} summary={bedsSummary} filters={f} onApply={go} wide>
            {(draft, set) => <BedsField f={draft} set={set} />}
          </FilterPopover>
        </div>
        <FilterSheet
          filters={f}
          ctx={ctx}
          onApply={go}
          activeCount={moreCount}
          trigger={({ onClick, activeCount }) => (
            <>
              <span className="hidden lg:inline-flex">
                <FiltersButton onClick={onClick} activeCount={activeCount} label={t.filters.more} />
              </span>
              <span className="lg:hidden">
                <FiltersButton onClick={onClick} activeCount={activeCount} label={t.filters.open} />
              </span>
            </>
          )}
        />
        <div className="ms-auto flex items-center gap-2">
          <label htmlFor={sortId} className="text-[13px] text-text-muted">
            {t.sort.label}
          </label>
          <select
            id={sortId}
            value={f.sort}
            onChange={(e) => go({ ...f, sort: e.target.value as SearchSort, page: 1 })}
            className="h-11 rounded-full border border-border bg-surface px-4 text-[14px] text-ink"
          >
            {searchSorts.map((s) => (
              <option key={s} value={s}>
                {s === "ppa" ? format(t.sort.ppa, { unit: areaUnitLabels[areaUnit] }) : t.sort[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
