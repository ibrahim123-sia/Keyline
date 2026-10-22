import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import {
  ViewingsCalendar,
  type CalendarColumn,
} from "@/components/admin/viewings/viewings-calendar";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { viewingStatuses } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import {
  activeAgents,
  calendarRange,
  listCalendarViewings,
  type CalendarView,
  type ViewingStatus,
} from "@/features/viewings/admin";
import { agencyParts } from "@/features/viewings/calendar-time";
import { zonedDate } from "@/features/viewings/slots";
import { requireAdminPage } from "@/lib/auth/guards";
import { first } from "@/lib/table-params";

export const metadata = { title: "Viewings" };
export const instant = false;

const views: CalendarView[] = ["week", "day", "agents"];
const viewLabels: Record<CalendarView, string> = { week: "Week", day: "Day", agents: "Agents" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const shiftDate = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
};
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Admin -> Viewings (09 §5): the calendar by week, day or agent. */
export default async function ViewingsPage(props: PageProps<"/admin/viewings">) {
  const { user } = await requireAdminPage();
  const sp = await props.searchParams;
  const db = await getDb();
  const [general, viewingSettings] = [
    await loadSettings("general", db),
    await loadSettings("viewings", db),
  ];
  const tz = general.timeZone;
  const view = (views as string[]).includes(first(sp.view) ?? "")
    ? (first(sp.view) as CalendarView)
    : "week";
  const today = zonedDate(new Date(), tz);
  const date = ISO_DATE.test(first(sp.date) ?? "") ? first(sp.date)! : today;
  const agentFilter = first(sp.agent) || null;
  const statusParam = first(sp.status) ?? "";
  const status = (viewingStatuses as readonly string[]).includes(statusParam)
    ? (statusParam as ViewingStatus)
    : null;
  const typeParam = first(sp.type);
  const type = typeParam === "video" || typeParam === "in_person" ? typeParam : null;

  const range = calendarRange(view, date, tz, general.firstDayOfWeek);
  const [agents, viewings] = [
    await activeAgents(db),
    await listCalendarViewings(db, {
      from: range.from,
      to: range.to,
      agentId: agentFilter,
      status,
      type,
    }),
  ];

  const columns: CalendarColumn[] =
    view === "agents"
      ? [
          ...agents
            .filter((a) => !agentFilter || a.id === agentFilter)
            .map((a) => ({ key: a.id, label: a.name, date, agentId: a.id })),
          ...(agentFilter ? [] : [{ key: "agency", label: "The agency", date, agentId: null }]),
        ]
      : range.days.map((d) => ({ key: d, label: dayLabel(d), date: d }));

  // Rows from the earliest opening to the latest closing, widened to fit every viewing shown.
  const ranges = Object.values(viewingSettings.workingHours).flat();
  let startMin = ranges.length ? Math.min(...ranges.map((r) => minutes(r[0]))) : 8 * 60;
  let endMin = ranges.length ? Math.max(...ranges.map((r) => minutes(r[1]))) : 20 * 60;
  for (const v of viewings) {
    const s = agencyParts(v.startsAt, tz).minutes;
    const e = s + (Date.parse(v.endsAt) - Date.parse(v.startsAt)) / 60_000;
    startMin = Math.min(startMin, Math.floor(s / 60) * 60);
    endMin = Math.max(endMin, Math.ceil(e / 60) * 60);
  }
  startMin = Math.max(0, Math.floor(startMin / 60) * 60 - 60);
  endMin = Math.min(24 * 60, Math.ceil(endMin / 60) * 60 + 60);

  const step = view === "week" ? 7 : 1;
  const link = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { view, date, agent: agentFilter, status, type, ...patch };
    for (const [k, val] of Object.entries(merged)) if (val) q.set(k, val);
    return `/admin/viewings?${q}`;
  };
  const title =
    view === "week"
      ? `${dayLabel(range.days[0]!)} – ${dayLabel(range.days.at(-1)!)}`
      : dayLabel(date);

  return (
    <>
      <PageHeader
        title="Viewings"
        description={`Times are in the agency's time zone (${tz}). Drag a viewing to move it, or open it to change its status.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/viewings/time-off">Days off and hours</Link>
            </Button>
            {!user.readOnly && (
              <Button asChild>
                <Link href="/admin/viewings/new">
                  <PlusIcon /> New viewing
                </Link>
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Calendar view" className="flex gap-1 rounded-md border border-border p-1">
          {views.map((v) => (
            <Link
              key={v}
              href={link({ view: v })}
              aria-current={v === view ? "page" : undefined}
              className={
                v === view
                  ? "rounded bg-ink px-3 py-1 text-[13px] font-semibold text-surface"
                  : "rounded px-3 py-1 text-[13px] font-semibold text-ink hover:bg-surface-muted"
              }
            >
              {viewLabels[v]}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="Earlier">
            <Link href={link({ date: shiftDate(date, -step) })}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={link({ date: today })}>Today</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="Later">
            <Link href={link({ date: shiftDate(date, step) })}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <h2 className="ms-2 text-[15px] font-semibold text-ink">{title}</h2>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2 text-[13px]">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={date} />
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Agent</span>
            <select
              name="agent"
              defaultValue={agentFilter ?? ""}
              className="h-8 rounded-md border border-input bg-surface px-2"
            >
              <option value="">All agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Status</span>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-8 rounded-md border border-input bg-surface px-2"
            >
              <option value="">Any status</option>
              <option value="requested">Requested</option>
              <option value="confirmed">Confirmed</option>
              <option value="done">Done</option>
              <option value="no_show">No-show</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Type</span>
            <select
              name="type"
              defaultValue={type ?? ""}
              className="h-8 rounded-md border border-input bg-surface px-2"
            >
              <option value="">In person and video</option>
              <option value="in_person">In person</option>
              <option value="video">Video</option>
            </select>
          </label>
          <Button type="submit" size="sm" variant="outline">
            Show
          </Button>
        </form>
      </div>
      <ViewingsCalendar
        columns={columns}
        viewings={viewings}
        timeZone={tz}
        startMin={startMin}
        endMin={endMin}
        agents={agents}
        readOnly={user.readOnly}
      />
      {viewings.length === 0 && (
        <p className="mt-3 text-[13px] text-text-muted">
          No viewings in this {view === "week" ? "week" : "day"}.
        </p>
      )}
    </>
  );
}
