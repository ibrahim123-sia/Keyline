"use client";

import { useState, type ReactNode } from "react";
import { cn } from "cn";
import type { PoiCategory } from "@/db/schema/master-data";
import type { PublicListing } from "@/features/listings/public";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { formatDistance, formatDuration, type DistanceUnit } from "@/lib/units";

const order: PoiCategory[] = ["schools", "health", "shopping", "transport", "leisure", "other"];

/**
 * Nearby places grouped by type with filter chips (06 §5.10). The server passes the type icons
 * already drawn (`icons` by icon name), so the icon set stays off the page's JavaScript.
 */
export function NearbyList({
  places,
  distanceUnit,
  icons,
}: {
  places: PublicListing["nearby"];
  distanceUnit: DistanceUnit;
  icons: Record<string, ReactNode>;
}) {
  const [category, setCategory] = useState<PoiCategory | null>(null);
  if (places.length === 0)
    return <p className="text-[14.5px] text-text-muted">{t.location.empty}</p>;
  const categories = order.filter((c) => places.some((p) => p.category === c));
  const shown = category ? places.filter((p) => p.category === category) : places;
  const groups = [...new Set(shown.map((p) => p.typeName))].map((name) => ({
    name,
    icon: shown.find((p) => p.typeName === name)!.typeIcon,
    items: shown.filter((p) => p.typeName === name),
  }));

  return (
    <div className="flex flex-col gap-4">
      {categories.length > 1 && (
        <div role="group" aria-label={t.location.title} className="flex flex-wrap gap-2">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors",
                category === c
                  ? "border-ink bg-ink text-surface"
                  : "border-border bg-surface text-ink hover:border-ink/40",
              )}
            >
              {c ? t.location.categories[c] : t.location.all}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.name}>
            <h3 className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-ink">
              {icons[g.icon ?? ""]}
              {g.name}
            </h3>
            <ul className="flex flex-col divide-y divide-border">
              {g.items.map((p) => {
                const seconds =
                  p.mode === "walk" ? (p.walkSeconds ?? p.driveSeconds) : p.driveSeconds;
                const mode = p.mode === "walk" && p.walkSeconds != null ? "walk" : "drive";
                return (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 py-2 text-[14.5px]"
                  >
                    <span className="text-text">{p.name}</span>
                    <span className="shrink-0 text-end text-[13.5px] text-text-muted tabular">
                      {p.overrideText ?? (
                        <>
                          {formatDistance(p.distanceM, distanceUnit)}
                          {seconds != null && (
                            <>
                              {" · "}
                              {format(mode === "walk" ? t.location.walk : t.location.drive, {
                                time: formatDuration(seconds),
                              })}
                            </>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
