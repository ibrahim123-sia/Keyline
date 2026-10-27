"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";
import { UrlFilterSelect } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { leadSources } from "@/db/schema/crm";
import { leadChannels } from "@/features/leads/filters";
import { leads as t } from "@/lib/i18n/dictionaries/leads";

type Option = { id: string; name: string };

function useUrlPatch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return {
    params,
    patch(values: Record<string, string | null>) {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(values)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    },
  };
}

function UrlToggle({
  param,
  value = "1",
  label,
}: {
  param: string;
  value?: string;
  label: string;
}) {
  const { params, patch } = useUrlPatch();
  const on = params.get(param) === value;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => patch({ [param]: on ? null : value })}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-[13px] transition-colors",
        on
          ? "border-accent bg-accent-soft text-ink"
          : "border-input bg-surface text-text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

const moreKeys = ["campaign", "smin", "smax", "from", "to", "bmin", "bmax", "area", "tag"] as const;

/** Campaign, score, dates, budget, area and tag: less used, so behind one button. */
function MoreFilters({ areas, currencyCode }: { areas: Option[]; currencyCode: string }) {
  const { params, patch } = useUrlPatch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const active = moreKeys.filter((k) => params.get(k)).length;
  const field = (key: (typeof moreKeys)[number], label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
      {label}
      <Input
        type={type}
        value={draft[key] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        className="h-8 text-[13px] font-normal"
      />
    </label>
  );
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(Object.fromEntries(moreKeys.map((k) => [k, params.get(k) ?? ""])));
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontalIcon aria-hidden /> More filters{active ? ` (${active})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form
          aria-label="More filters"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            patch(Object.fromEntries(moreKeys.map((k) => [k, draft[k]?.trim() || null])));
            setOpen(false);
          }}
        >
          {field("campaign", "Campaign")}
          <div className="grid grid-cols-2 gap-2">
            {field("smin", "Score from", "number")}
            {field("smax", "Score to", "number")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field("from", "Created from", "date")}
            {field("to", "Created to", "date")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field("bmin", `Budget from (${currencyCode})`, "number")}
            {field("bmax", `Budget to (${currencyCode})`, "number")}
          </div>
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
            Area
            <select
              value={draft.area ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}
              className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] font-normal"
            >
              <option value="">Any area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {field("tag", "Tag")}
          <div className="flex justify-between gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                patch(Object.fromEntries(moreKeys.map((k) => [k, null])));
                setOpen(false);
              }}
            >
              Clear these
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** The leads list's filters (09 §4), all kept in the address. */
export function LeadFilters({
  stages,
  agents,
  areas,
  leadTypes,
  currencyCode,
}: {
  stages: Option[];
  agents: Array<Option & { isActive: boolean }>;
  areas: Option[];
  leadTypes: string[];
  currencyCode: string;
}) {
  return (
    <>
      <UrlFilterSelect
        param="stage"
        label="Stage"
        options={stages.map((s) => ({ value: s.id, label: s.name }))}
      />
      <UrlFilterSelect
        param="source"
        label="Source"
        options={leadSources.map((s) => ({ value: s, label: t.sources[s] }))}
      />
      <UrlFilterSelect
        param="channel"
        label="Channel"
        options={leadChannels.map((c) => ({ value: c, label: t.channels[c] }))}
      />
      <UrlFilterSelect
        param="type"
        label="Type"
        options={leadTypes.map((x) => ({ value: x, label: x[0]!.toUpperCase() + x.slice(1) }))}
      />
      <UrlFilterSelect
        param="agent"
        label="Agent"
        options={[
          { value: "none", label: "Not assigned" },
          ...agents.map((a) => ({
            value: a.id,
            label: a.isActive ? a.name : `${a.name} (inactive)`,
          })),
        ]}
      />
      <UrlFilterSelect
        param="status"
        label="Status"
        options={[
          { value: "open", label: "Open" },
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
        ]}
      />
      <UrlToggle param="unanswered" label="Unanswered" />
      <UrlToggle param="viewing" value="any" label="Has a viewing" />
      <MoreFilters areas={areas} currencyCode={currencyCode} />
    </>
  );
}

/** Search box for the board, which has no table around it. */
export function LeadSearch() {
  const { params, patch } = useUrlPatch();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const id = setTimeout(() => patch({ q: q || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <Input
      type="search"
      aria-label="Search leads"
      placeholder="Search name, email or phone"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      className="h-8 w-64 text-[13px]"
    />
  );
}
