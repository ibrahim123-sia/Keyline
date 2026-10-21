"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "cn";
import { format } from "@/lib/i18n";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";

type SlotData = { timeZone: string; slots: string[] };

const visitorZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};

const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
const dayLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
const timeLabel = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );

/**
 * Free viewing times (09 §5), grouped by day in the visitor's own time zone, with the
 * agency's time in brackets when it differs. `source` is the query for /api/viewings/slots.
 */
export function SlotPicker({
  source,
  value,
  onChange,
  reloadKey = 0,
  error,
}: {
  source: string;
  value: string | null;
  onChange: (start: string | null) => void;
  /** Change it to fetch the free times again (after a time was taken). */
  reloadKey?: number;
  error?: string;
}) {
  const id = useId();
  const [data, setData] = useState<SlotData | null>(null);
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/viewings/slots?${source}`, { signal: ctl.signal })
      .then((r) =>
        r.ok ? (r.json() as Promise<SlotData>) : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== "AbortError") setFailed(true);
      });
    return () => ctl.abort();
  }, [source, reloadKey]);

  const zone = useMemo(() => visitorZone() ?? data?.timeZone ?? "UTC", [data]);
  const days = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of data?.slots ?? []) {
      const key = dayKey(s, zone);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].slice(0, 14);
  }, [data, zone]);

  if (failed) return <p className="text-[14px] text-danger">{t.booking.failed}</p>;
  if (!data) return <p className="text-[14px] text-text-muted">{t.booking.loading}</p>;
  if (days.length === 0) return <p className="text-[14px] text-text-muted">{t.booking.none}</p>;

  const selectedDay = day && days.some(([k]) => k === day) ? day : (days[0]?.[0] ?? null);
  const times = days.find(([k]) => k === selectedDay)?.[1] ?? [];
  const showAgency =
    zone !== data.timeZone && times.some((s) => timeLabel(s, zone) !== timeLabel(s, data.timeZone));
  const chip =
    "inline-flex cursor-pointer items-center justify-center rounded-full border px-3.5 py-2 text-[14px] font-semibold transition-colors peer-focus-visible:outline-2";

  return (
    <div className="flex flex-col gap-3">
      {showAgency && (
        <p className="text-[13px] text-text-muted">
          {format(t.booking.yourTime, {
            zone: zone.split("/").at(-1)!.replace(/_/g, " "),
            agency: data.timeZone.split("/").at(-1)!.replace(/_/g, " "),
          })}
        </p>
      )}
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold text-ink">{t.booking.dayLabel}</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map(([key, slots]) => (
            <label key={key} className="shrink-0">
              <input
                type="radio"
                name={`${id}-day`}
                className="peer sr-only"
                checked={key === selectedDay}
                onChange={() => {
                  setDay(key);
                  onChange(null);
                }}
              />
              <span
                className={cn(
                  chip,
                  key === selectedDay
                    ? "border-ink bg-ink text-surface"
                    : "border-border bg-surface text-ink hover:border-ink/40",
                )}
              >
                {dayLabel(slots[0]!, zone)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold text-ink">{t.booking.timeLabel}</legend>
        <div className="flex flex-wrap gap-2">
          {times.map((s) => (
            <label key={s}>
              <input
                type="radio"
                name={`${id}-time`}
                value={s}
                className="peer sr-only"
                checked={value === s}
                onChange={() => onChange(s)}
              />
              <span
                className={cn(
                  chip,
                  value === s
                    ? "border-accent bg-accent text-surface"
                    : "border-border bg-surface text-ink hover:border-ink/40",
                )}
              >
                {timeLabel(s, zone)}
                {showAgency && (
                  <span className="ms-1 font-normal opacity-80">
                    ({timeLabel(s, data.timeZone)})
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
    </div>
  );
}

export { visitorZone };
