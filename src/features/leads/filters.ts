import { leadSources, type LeadSource, type Touch } from "@/db/schema/crm";

/**
 * Admin -> Leads filters (09 §4) as URL parameters, so every view can be shared and saved.
 * Pure: the list query and the filter bar both use it.
 */
export const leadSortable = ["created", "activity", "score", "name", "next_task"] as const;
export type LeadSort = (typeof leadSortable)[number];

export const leadChannels = [
  "paid_search",
  "paid_social",
  "organic_search",
  "organic_social",
  "email",
  "referral",
  "direct",
  "portal",
  "offline_qr",
] as const satisfies ReadonlyArray<Touch["channel"]>;

export type LeadFilters = {
  q: string;
  stage: string[];
  source: LeadSource[];
  channel: Array<Touch["channel"]>;
  type: string[];
  campaign: string | null;
  /** An agent id, or "none" for unassigned leads. */
  agent: string | null;
  scoreMin: number | null;
  scoreMax: number | null;
  /** Created between these agency-local dates (YYYY-MM-DD). */
  from: string | null;
  to: string | null;
  unanswered: boolean;
  /** "any": has a viewing; "week": a viewing this week. */
  viewing: "any" | "week" | null;
  /** Major units of the base currency. */
  budgetMin: number | null;
  budgetMax: number | null;
  /** A location id: leads looking there or anywhere inside it. */
  area: string | null;
  status: "open" | "won" | "lost" | null;
  tag: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: string | undefined, min: number, max: number): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

export function leadFiltersFrom(
  get: (key: string) => string | undefined,
  getAll: (key: string) => string[],
  q = "",
): LeadFilters {
  const viewing = get("viewing");
  const status = get("status");
  const agent = get("agent");
  return {
    q: q.trim().slice(0, 100),
    stage: getAll("stage").filter((s) => UUID.test(s)),
    source: getAll("source").filter((s): s is LeadSource =>
      (leadSources as readonly string[]).includes(s),
    ),
    channel: getAll("channel").filter((c): c is Touch["channel"] =>
      (leadChannels as readonly string[]).includes(c),
    ),
    type: getAll("type")
      .map((t) => t.trim().slice(0, 30))
      .filter(Boolean),
    campaign: get("campaign")?.trim().slice(0, 200) || null,
    agent: agent === "none" || (agent && UUID.test(agent)) ? agent : null,
    scoreMin: num(get("smin"), 0, 100),
    scoreMax: num(get("smax"), 0, 100),
    from: DATE.test(get("from") ?? "") ? get("from")! : null,
    to: DATE.test(get("to") ?? "") ? get("to")! : null,
    unanswered: get("unanswered") === "1",
    viewing: viewing === "any" || viewing === "week" ? viewing : null,
    budgetMin: num(get("bmin"), 0, 1e13),
    budgetMax: num(get("bmax"), 0, 1e13),
    area: UUID.test(get("area") ?? "") ? get("area")! : null,
    status: status === "open" || status === "won" || status === "lost" ? status : null,
    tag: get("tag")?.trim().slice(0, 40) || null,
  };
}

/** Built-in views (09 §4); the agency can save its own next to them. */
export const builtInLeadViews: Array<{ label: string; params: Record<string, string> }> = [
  { label: "Unanswered", params: { unanswered: "1" } },
  { label: "Hot (score 70+)", params: { smin: "70" } },
  { label: "Viewings this week", params: { viewing: "week" } },
  { label: "Sellers and landlords", params: { type: "seller,landlord" } },
];

/** "3 min", "2 h 5 min", "4 days": how long a reply took or how long they have waited. */
export function durationText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", then the date. */
export function relativeTime(iso: string | Date, now: Date = new Date()): string {
  const at = typeof iso === "string" ? new Date(iso) : iso;
  const s = (now.getTime() - at.getTime()) / 1000;
  if (s < 0) {
    const ahead = -s;
    if (ahead < 3600) return `in ${Math.max(1, Math.round(ahead / 60))} min`;
    if (ahead < 86_400) return `in ${Math.round(ahead / 3600)} h`;
    const days = Math.round(ahead / 86_400);
    return days === 1 ? "tomorrow" : `in ${days} days`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.floor(s / 86_400);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return at.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}
