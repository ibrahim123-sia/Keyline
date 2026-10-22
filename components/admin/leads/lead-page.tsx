"use client";

import {
  CalendarPlusIcon,
  ExternalLinkIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  RefreshCwIcon,
  TrophyIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { assignLead, changeLeadStage, setLeadType } from "@/features/leads/actions";
import { durationText, relativeTime } from "@/features/leads/filters";
import { rescoreLead } from "@/features/leads/lead-actions";
import type { LeadPageData, TimelineItem } from "@/features/leads/page-data";
import { callOutcomeLabels, timelineOptions, type CallOutcome } from "@/features/leads/schema";
import { touchSource, landingText } from "@/features/attribution/describe";
import type { Touch } from "@/db/schema/crm";
import { leads as t } from "@/lib/i18n/dictionaries/leads";
import { formatMoney } from "@/lib/money";
import { useAction } from "@/lib/use-action";
import { Composer, ContactPanel, RequirementsPanel, Tasks } from "./lead-forms";
import { ScoreBadge } from "./score-badge";
import { StageMoveDialog, type StageChoice } from "./stage-move-dialog";

type Data = LeadPageData;

const when = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Box({
  title,
  actions,
  children,
  id,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  const headingId = `lead-${(id ?? title).toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-ink">
          {title}
        </h2>
        {actions}
      </header>
      <div className="flex flex-col gap-2 px-4 py-3 text-[13px]">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-end text-ink">
        {children ?? <span className="text-text-muted">—</span>}
      </dd>
    </div>
  );
}

function TouchRows({ label, touch }: { label: string; touch: Touch | null }) {
  if (!touch) return <Row label={label}>{null}</Row>;
  return (
    <Row label={label}>
      <span className="block">{touchSource(touch)}</span>
      <span className="block text-[12px] text-text-muted">
        {t.channels[touch.channel]}
        {touch.utm_campaign ? ` · ${touch.utm_campaign}` : ""} · {landingText(touch.landing_path)}
      </span>
    </Row>
  );
}

function eventText(
  item: Extract<TimelineItem, { kind: "event" }>,
  data: Data,
): { title: string; detail?: string | null } {
  const m = item.meta;
  const agentName = (id: unknown) =>
    data.options.agents.find((a) => a.id === id)?.name ?? "an agent";
  const listing = data.eventListings.find((l) => l.id === m.propertyId);
  const about = listing ? ` about ${listing.reference}` : "";
  switch (item.type) {
    case "created":
      return {
        title: `Came in: ${t.sources[m.source as keyof typeof t.sources] ?? "Lead"}${about}`,
        detail: item.body,
      };
    case "form":
      return {
        title: `Got in touch again: ${t.sources[m.source as keyof typeof t.sources] ?? "form"}${about}`,
        detail: item.body,
      };
    case "assigned":
      return {
        title: m.agentId
          ? `Assigned to ${(m.agentName as string) ?? agentName(m.agentId)}`
          : "Unassigned",
      };
    case "stage_changed": {
      const to = (m.to as { name?: string } | undefined)?.name ?? "a stage";
      const extra =
        m.kind === "lost" && m.lostReason
          ? `Reason: ${String(m.lostReason)}`
          : m.kind === "won" && typeof m.dealValue === "number"
            ? `Deal value: ${formatMoney(m.dealValue, data.options.baseCurrency)}`
            : null;
      return { title: `Moved to ${to}`, detail: extra };
    }
    case "note":
      return { title: "Note", detail: item.body };
    case "call":
      return {
        title: `Call: ${callOutcomeLabels[m.outcome as CallOutcome] ?? "logged"}`,
        detail: item.body,
      };
    case "email_sent":
      return m.auto
        ? { title: "Automatic reply sent" }
        : { title: `Email sent: ${String(m.subject ?? "")}`, detail: item.body };
    case "email_received":
      return { title: "Email received", detail: item.body };
    case "whatsapp_in":
      return { title: "WhatsApp message", detail: item.body };
    case "whatsapp_out":
      return { title: "WhatsApp sent", detail: item.body };
    case "task_done":
      return { title: `Task done: ${item.body ?? ""}` };
    case "property_sent":
      return { title: `Sent ${String(m.count ?? "")} homes`.replace("  ", " "), detail: item.body };
    case "merged":
      return { title: "Merged with another lead", detail: item.body };
    case "possible_call":
      return { title: "Tapped Call on the website (may be phoning)" };
    case "viewing_booked":
      return { title: "Viewing booked", detail: item.body };
    case "viewing_done":
      return { title: "Viewing done", detail: item.body };
    case "ai_summary":
      return { title: "AI summary", detail: item.body };
    default:
      return { title: item.type.replace(/_/g, " "), detail: item.body };
  }
}

function Timeline({ data }: { data: Data }) {
  if (data.timeline.length === 0)
    return <p className="text-[13px] text-text-muted">Nothing yet.</p>;
  return (
    <ol aria-label="Timeline" className="flex flex-col gap-3">
      {data.timeline.map((item) => {
        let title: string;
        let detail: string | null | undefined;
        let who: string | null = null;
        if (item.kind === "event") {
          ({ title, detail } = eventText(item, data));
          who =
            item.actor ??
            (item.actorType === "customer"
              ? data.contact.name
              : item.actorType === "ai"
                ? "AI"
                : null);
        } else if (item.kind === "message") {
          title = `${item.channel === "web_chat" ? "Chat" : item.channel === "whatsapp" ? "WhatsApp" : "Email"} ${
            item.direction === "in" ? "from" : "to"
          } ${item.direction === "in" ? data.contact.name : data.contact.name.split(" ")[0]}`;
          detail = item.body;
          who =
            item.direction === "out"
              ? item.sender === "ai"
                ? "AI"
                : item.sender === "admin"
                  ? "Team"
                  : null
              : null;
        } else {
          title = `${item.type === "video" ? "Video tour" : "Viewing"} ${item.status}: ${when.format(new Date(item.startsAt))}`;
          detail = item.listing;
        }
        return (
          <li
            key={`${item.kind}-${item.id}`}
            className="rounded-md border border-border bg-surface px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[13px] font-semibold text-ink">{title}</p>
              <time
                dateTime={item.at}
                className="text-[12px] text-text-muted"
                title={when.format(new Date(item.at))}
              >
                {who ? `${who} · ` : ""}
                {relativeTime(item.at, new Date(data.now))}
              </time>
            </div>
            {detail && <p className="mt-1 text-[13px] whitespace-pre-line text-ink">{detail}</p>}
            {item.kind === "message" && item.toolCalls.length > 0 && (
              <ul className="mt-1 text-[12px] text-text-muted">
                {item.toolCalls.map((c, i) => (
                  <li key={i}>{c.summary}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The lead page (09 §4): who they are, what happened, what to do next. */
export function LeadPage({
  data,
  readOnly,
  sendHomes,
  shortlists,
}: {
  data: Data;
  readOnly?: boolean;
  /** "Send to lead" for matching homes (shortlists). */
  sendHomes?: ReactNode;
  shortlists?: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"note" | "call" | "email">("note");
  const [editContact, setEditContact] = useState(false);
  const [editNeeds, setEditNeeds] = useState(false);
  const [closing, setClosing] = useState<StageChoice | null>(null);
  const { lead, contact, options } = data;
  const r = lead.requirements;
  const base = options.baseCurrency;
  const refresh = () => router.refresh();
  const stageAction = useAction(changeLeadStage, { success: "Stage changed", onSuccess: refresh });
  const agentAction = useAction(assignLead, { success: "Agent changed", onSuccess: refresh });
  const typeAction = useAction(setLeadType, { success: "Type changed", onSuccess: refresh });
  const rescore = useAction(rescoreLead, {
    success: (d) => `Scored ${d.score ?? "—"}`,
    onSuccess: refresh,
  });
  const wonStage = options.stages.find((s) => s.kind === "won");
  const lostStage = options.stages.find((s) => s.kind === "lost");
  const phone = contact.phone ?? contact.whatsapp;
  const focusComposer = (next: "call" | "email") => {
    setTab(next);
    document
      .getElementById("lead-composer")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const waited = (new Date(data.now).getTime() - new Date(lead.createdAt).getTime()) / 1000;

  function moveTo(stageId: string) {
    const stage = options.stages.find((s) => s.id === stageId);
    if (!stage) return;
    if (stage.kind === "open")
      void stageAction.run({ id: lead.id, stageId, lostReason: null, dealValue: null });
    else setClosing(stage);
  }

  const money = (minor: number | null | undefined) =>
    minor === null || minor === undefined
      ? null
      : formatMoney(
          minor,
          r.currency && r.currency !== base.code
            ? { ...base, code: r.currency, symbol: r.currency }
            : base,
        );
  const budget =
    r.budgetMin != null || r.budgetMax != null
      ? `${money(r.budgetMin) ?? "…"} – ${money(r.budgetMax) ?? "…"}${r.budgetFrom === "listing" ? " (from the home they asked about)" : ""}`
      : null;
  const named = (ids: string[] | undefined, list: Array<{ id: string; name: string }>) =>
    ids?.length ? ids.map((id) => list.find((x) => x.id === id)?.name ?? "—").join(", ") : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: type, stage, score, agent and quick actions */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
        <label className="flex items-center gap-1.5 text-[13px] text-text-muted">
          Type
          <select
            aria-label="Type"
            value={lead.type}
            disabled={readOnly || typeAction.pending}
            onChange={(e) => typeAction.run({ id: lead.id, type: e.target.value })}
            className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink capitalize"
          >
            {[...new Set([lead.type, ...options.leadTypes])].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-text-muted">
          Stage
          <select
            aria-label="Stage"
            value={lead.stageId ?? ""}
            disabled={readOnly || stageAction.pending}
            onChange={(e) => moveTo(e.target.value)}
            className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
          >
            {!lead.stageId && <option value="">No stage</option>}
            {options.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-text-muted">
          Agent
          <select
            aria-label="Agent"
            value={lead.agentId ?? ""}
            disabled={readOnly || agentAction.pending}
            onChange={(e) => agentAction.run({ id: lead.id, agentId: e.target.value || null })}
            className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
          >
            <option value="">Not assigned</option>
            {options.agents
              .filter((a) => a.isActive || a.id === lead.agentId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <span className="flex items-center gap-1.5 text-[13px] text-text-muted">
          Score <ScoreBadge score={lead.aiScore} reasons={lead.aiScoreReason} />
        </span>
        {lead.status !== "open" && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
              lead.status === "won" ? "bg-accent-soft text-ink" : "bg-muted text-text-muted",
            )}
          >
            {lead.status === "won" ? "Won" : `Lost${lead.lostReason ? `: ${lead.lostReason}` : ""}`}
          </span>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/inbox?lead=${lead.id}`}>
              <MessageCircleIcon aria-hidden /> WhatsApp
            </Link>
          </Button>
          {phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${phone}`}>
                <PhoneIcon aria-hidden /> Call
              </a>
            </Button>
          )}
          {!readOnly && (
            <>
              <Button variant="outline" size="sm" onClick={() => focusComposer("call")}>
                Log call
              </Button>
              <Button variant="outline" size="sm" onClick={() => focusComposer("email")}>
                <MailIcon aria-hidden /> Email
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/admin/viewings/new?lead=${lead.id}${lead.propertyIds[0] ? `&property=${lead.propertyIds[0]}` : ""}`}
                >
                  <CalendarPlusIcon aria-hidden /> Book viewing
                </Link>
              </Button>
              {lead.status === "open" && wonStage && (
                <Button variant="outline" size="sm" onClick={() => setClosing(wonStage)}>
                  <TrophyIcon aria-hidden /> Mark won
                </Button>
              )}
              {lead.status === "open" && lostStage && (
                <Button variant="outline" size="sm" onClick={() => setClosing(lostStage)}>
                  <XCircleIcon aria-hidden /> Mark lost
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Left: who they are */}
        <div className="flex flex-col gap-4">
          <Box
            title="Contact"
            actions={
              !readOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit contact"
                  onClick={() => setEditContact(true)}
                >
                  <PencilIcon aria-hidden />
                </Button>
              )
            }
          >
            <dl className="flex flex-col gap-1.5">
              <Row label="Email">
                {contact.email && (
                  <a className="hover:underline" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                )}
              </Row>
              <Row label="Phone">{contact.phone}</Row>
              <Row label="WhatsApp">{contact.whatsapp}</Row>
              <Row label="Prefers">{contact.preferredContact}</Row>
              <Row label="Language">{contact.preferredLanguage}</Row>
              <Row label="Marketing">
                {contact.marketingConsent
                  ? `Agreed${contact.marketingConsentAt ? ` on ${new Date(contact.marketingConsentAt).toLocaleDateString("en")}` : ""}`
                  : "Not agreed"}
              </Row>
            </dl>
            {data.siblings.length > 0 && (
              <p className="text-[12px] text-text-muted">
                Also:{" "}
                {data.siblings.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    <Link href={`/admin/leads/${s.id}`} className="capitalize underline">
                      {s.type} lead
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </Box>
          <Box
            title="Looking for"
            actions={
              !readOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit requirements"
                  onClick={() => setEditNeeds(true)}
                >
                  <PencilIcon aria-hidden />
                </Button>
              )
            }
          >
            <dl className="flex flex-col gap-1.5">
              <Row label="Purpose">
                {r.purpose ? (r.purpose === "sale" ? "Buy" : "Rent") : null}
              </Row>
              <Row label="Budget">{budget}</Row>
              <Row label="Bedrooms">{r.bedsMin != null ? `${r.bedsMin}+` : null}</Row>
              <Row label="Areas">{named(r.locationIds, data.locations)}</Row>
              <Row label="Types">{named(r.propertyTypeIds, data.propertyTypes)}</Row>
              <Row label="When">
                {timelineOptions.find((o) => o.value === r.timeline)?.label ?? null}
              </Row>
              <Row label="Paying with">{r.finance}</Row>
            </dl>
            {r.notes && <p className="text-[12.5px] text-text-muted">{r.notes}</p>}
          </Box>
          <Box title="Interested in">
            {data.interest.length === 0 && data.projects.length === 0 && (
              <p className="text-text-muted">No listing or project yet.</p>
            )}
            {data.interest.map((l) => (
              <div key={l.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/properties/${l.id}`}
                    className="block truncate font-semibold text-ink hover:underline"
                  >
                    {l.reference} · {l.title}
                  </Link>
                  <p className="text-[12px] text-text-muted">
                    {l.price}
                    {l.locationName ? ` · ${l.locationName}` : ""}
                  </p>
                </div>
                <a
                  href={`/property/${l.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${l.reference} on the site`}
                >
                  <ExternalLinkIcon className="size-4 text-text-muted" aria-hidden />
                </a>
              </div>
            ))}
            {data.projects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className="font-semibold text-ink hover:underline"
              >
                {p.name}
              </Link>
            ))}
          </Box>
          <Box title="Where they came from" id="attribution">
            <p className="text-ink">
              {data.attribution ?? "No website visit on record (added by the team or imported)."}
            </p>
            <dl className="flex flex-col gap-1.5">
              <Row label="Source">
                {t.sources[lead.source]}
                {lead.sourceDetail ? ` (${lead.sourceDetail})` : ""}
              </Row>
              <TouchRows label="First touch" touch={lead.firstTouch} />
              <TouchRows label="Last touch" touch={lead.lastTouch} />
            </dl>
          </Box>
        </div>

        {/* Centre: the timeline and the composer */}
        <div className="flex flex-col gap-3" id="lead-composer">
          {!lead.firstResponseAt && lead.status === "open" && (
            <p
              role="status"
              className="rounded-md border border-danger/40 bg-surface px-3 py-2 text-[13px] text-danger"
            >
              Not answered yet: waiting {durationText(waited)}.
            </p>
          )}
          {lead.firstResponseAt && lead.responseSeconds !== null && (
            <p className="text-[12.5px] text-text-muted">
              First reply after {durationText(lead.responseSeconds)}.
            </p>
          )}
          <Composer data={data} tab={tab} onTab={setTab} readOnly={readOnly} />
          <Timeline data={data} />
        </div>

        {/* Right: score, next step, matches, tasks, viewings, journey */}
        <div className="flex flex-col gap-4">
          <Box
            title="Score"
            actions={
              !readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={rescore.pending}
                  onClick={() => rescore.run({ id: lead.id })}
                >
                  <RefreshCwIcon aria-hidden /> Rescore
                </Button>
              )
            }
          >
            {lead.aiScore === null ? (
              <p className="text-text-muted">Not scored yet.</p>
            ) : (
              <>
                <p className="text-[22px] font-semibold text-ink tabular">{lead.aiScore}</p>
                <ul className="flex flex-col gap-0.5 text-[12.5px]">
                  {(lead.aiScoreReason ?? "")
                    .split("\n")
                    .filter(Boolean)
                    .map((line) => (
                      <li key={line} className={line.startsWith("-") ? "text-danger" : "text-ink"}>
                        {line}
                      </li>
                    ))}
                </ul>
              </>
            )}
            {lead.aiSummary && <p className="text-[12.5px] text-text-muted">{lead.aiSummary}</p>}
          </Box>
          <Box title="Next step">
            <p className="text-ink">{data.nextStep.text}</p>
          </Box>
          <Box
            title="Matching homes"
            actions={!readOnly && data.matching.length > 0 ? sendHomes : null}
          >
            {data.matching.length === 0 ? (
              <p className="text-text-muted">Nothing live matches their requirements yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.matching.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/admin/properties/${l.id}`}
                      className="block truncate font-semibold text-ink hover:underline"
                    >
                      {l.reference} · {l.title}
                    </Link>
                    <p className="text-[12px] text-text-muted">
                      {l.price}
                      {l.beds != null ? ` · ${l.beds === 0 ? "Studio" : `${l.beds} bed`}` : ""}
                      {l.locationName ? ` · ${l.locationName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Box>
          {shortlists}
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <Tasks data={data} readOnly={readOnly} />
          </div>
          <Box title="Viewings">
            {data.viewings.length === 0 ? (
              <p className="text-text-muted">No viewings yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.viewings.map((v) => (
                  <li key={v.id}>
                    <p className="text-ink">
                      {when.format(new Date(v.startsAt))} ·{" "}
                      <span className="capitalize">{v.status.replace("_", " ")}</span>
                    </p>
                    <p className="text-[12px] text-text-muted">
                      {v.listing ?? "No listing"}
                      {v.agentName ? ` · ${v.agentName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Box>
          <Box title="Journey">
            {data.journey.length === 0 ? (
              <p className="text-text-muted">No site visits on record.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.journey.map((j) => (
                  <li key={j.id} className="flex justify-between gap-2 text-[12.5px]">
                    <span className="min-w-0 truncate text-ink">
                      {j.listing
                        ? `Viewed ${j.listing.reference}`
                        : j.type === "page_view"
                          ? (j.path ?? "Page")
                          : j.type.replace(/_/g, " ")}
                    </span>
                    <span className="shrink-0 text-text-muted">
                      {relativeTime(j.at, new Date(data.now))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
        </div>
      </div>

      {!readOnly && (
        <>
          <ContactPanel data={data} open={editContact} onOpenChange={setEditContact} />
          <RequirementsPanel data={data} open={editNeeds} onOpenChange={setEditNeeds} />
        </>
      )}
      <StageMoveDialog
        stage={closing}
        lostReasons={options.lostReasons}
        currency={base}
        onCancel={() => setClosing(null)}
        onConfirm={async (extra) => {
          if (!closing) return false;
          const res = await changeLeadStage({ id: lead.id, stageId: closing.id, ...extra });
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(`Moved to ${closing.name}`);
          refresh();
          return true;
        }}
      />
    </div>
  );
}
