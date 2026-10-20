"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { WeekdayKey } from "@/db/schema/people";
import { weekdayKeys, weekdayLabels } from "@/features/agents/schema";

export type WeekHours = Record<WeekdayKey, Array<[string, string]>>;

/** "18:30" -> "19:30", capped at the end of the day. */
function oneHourLater(time: string): string {
  const hour = Number(time.slice(0, 2)) + 1;
  return hour > 23 ? "23:59" : `${String(hour).padStart(2, "0")}:${time.slice(3)}`;
}

/** Weekdays starting on the agency's first day of the week (0 = Sunday, 1 = Monday, 6 = Saturday). */
export function orderedWeekdays(firstDayOfWeek: number): WeekdayKey[] {
  const sundayFirst: WeekdayKey[] = ["sun", ...weekdayKeys.filter((d) => d !== "sun")];
  return [...sundayFirst.slice(firstDayOfWeek), ...sundayFirst.slice(0, firstDayOfWeek)];
}

/**
 * Per-day working hours (05 `agents.working_hours`): a day is off, or has up to four time
 * ranges. Used by viewing slots and the lead response timer.
 */
export function WorkingHoursEditor({
  value,
  onChange,
  firstDayOfWeek,
  error,
}: {
  value: WeekHours;
  onChange: (v: WeekHours) => void;
  firstDayOfWeek: number;
  error?: string;
}) {
  const setDay = (day: WeekdayKey, ranges: Array<[string, string]>) =>
    onChange({ ...value, [day]: ranges });
  return (
    <div className="flex flex-col gap-1">
      <ul className="divide-y divide-border rounded-md border border-border">
        {orderedWeekdays(firstDayOfWeek).map((day) => {
          const ranges = value[day];
          const working = ranges.length > 0;
          return (
            <li key={day} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <div className="flex w-36 items-center gap-2 pt-1">
                <Switch
                  checked={working}
                  onCheckedChange={(on) => setDay(day, on ? [["09:00", "18:00"]] : [])}
                  aria-label={`${weekdayLabels[day]}: working`}
                />
                <span className="text-[13px] font-medium text-ink">{weekdayLabels[day]}</span>
              </div>
              {working ? (
                <div className="flex flex-1 flex-col gap-1.5">
                  {ranges.map(([from, to], i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        value={from}
                        aria-label={`${weekdayLabels[day]} from`}
                        className="h-8 w-28"
                        onChange={(e) =>
                          setDay(
                            day,
                            ranges.map((r, j) => (j === i ? [e.target.value, r[1]] : r)),
                          )
                        }
                      />
                      <span className="text-text-muted" aria-hidden>
                        –
                      </span>
                      <Input
                        type="time"
                        value={to}
                        aria-label={`${weekdayLabels[day]} until`}
                        className="h-8 w-28"
                        onChange={(e) =>
                          setDay(
                            day,
                            ranges.map((r, j) => (j === i ? [r[0], e.target.value] : r)),
                          )
                        }
                      />
                      {ranges.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${weekdayLabels[day]} ${from}–${to}`}
                          onClick={() =>
                            setDay(
                              day,
                              ranges.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <XIcon />
                        </Button>
                      )}
                    </div>
                  ))}
                  {ranges.length < 4 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => {
                        const start = ranges.at(-1)![1];
                        setDay(day, [...ranges, [start, oneHourLater(start)]]);
                      }}
                    >
                      <PlusIcon /> Add hours
                    </Button>
                  )}
                </div>
              ) : (
                <span className="pt-1.5 text-[13px] text-text-muted">Day off</span>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
