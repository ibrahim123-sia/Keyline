"use client";

import { CheckIcon, PencilIcon, SparklesIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  askAdminAssistant,
  confirmAssistantProposal,
  rejectAssistantProposal,
  type AssistantProposal,
} from "@/features/ai/assistant/admin-actions";
import { admin } from "@/lib/i18n";

const t = admin.assistant;

type Line = {
  role: "user" | "assistant";
  text: string;
  proposals?: Array<
    AssistantProposal & { state?: "executed" | "rejected" | "failed"; note?: string }
  >;
  tools?: string[];
};

const STORE = "keyline:admin-assistant";

function load(): { sessionId: string; lines: Line[] } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as {
      sessionId: string;
      lines: Line[];
    } | null;
    if (saved?.sessionId) return saved;
  } catch {
    // Private mode or a broken entry: start fresh.
  }
  return { sessionId: crypto.randomUUID(), lines: [] };
}

function save(state: { sessionId: string; lines: Line[] }) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ ...state, lines: state.lines.slice(-40) }));
  } catch {
    // Not stored: the panel still works for this page.
  }
}

/** A value on the preview card: before -> after, a list or plain text. */
function PreviewValue({ value }: { value: unknown }) {
  if (value && typeof value === "object" && !Array.isArray(value) && "after" in value) {
    const v = value as { before: unknown; after: unknown };
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-text-muted line-through decoration-1">{show(v.before)}</span>
        <span className="font-medium text-ink">{show(v.after)}</span>
      </span>
    );
  }
  if (Array.isArray(value))
    return (
      <ul className="list-disc ps-4">
        {value.map((x, i) => (
          <li key={i}>{show(x)}</li>
        ))}
      </ul>
    );
  return <span className="whitespace-pre-wrap">{show(value)}</span>;
}

const show = (v: unknown): string =>
  v === null || v === undefined || v === ""
    ? t.none
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

/** AIActionPreview (10 §3): what will change, where, and Confirm / Edit / Cancel. */
function ProposalCard({
  proposal,
  onDecided,
}: {
  proposal: NonNullable<Line["proposals"]>[number];
  onDecided: (state: "executed" | "rejected" | "failed", note?: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(proposal.input);
  const [busy, setBusy] = useState(false);
  const { summary, link, ...fields } = proposal.preview as {
    summary?: string;
    link?: string;
  } & Record<string, unknown>;
  const editable = Object.entries(draft).filter(
    ([, v]) => typeof v === "string" || typeof v === "number",
  );

  const decide = async (confirm: boolean) => {
    setBusy(true);
    const res = confirm
      ? await confirmAssistantProposal({ id: proposal.id, input: editing ? draft : undefined })
      : await rejectAssistantProposal({ id: proposal.id });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (confirm) {
      const result = (res.data as { result?: { done?: string } | null }).result;
      toast.success(result?.done ?? t.done);
      onDecided("executed", result?.done);
      router.refresh();
    } else onDecided("rejected");
  };

  return (
    <div
      role="group"
      aria-label={summary ?? proposal.tool}
      className="mt-2 rounded-lg border border-border bg-surface p-3 text-[13px]"
    >
      <p className="mb-2 font-semibold text-ink">{summary ?? proposal.tool}</p>
      {!editing && (
        <dl className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-3 gap-y-1.5">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-text-muted">{key}</dt>
              <dd>
                <PreviewValue value={value} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {editing && (
        <div className="flex flex-col gap-2">
          {editable.map(([key, value]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-text-muted">{key}</span>
              <Textarea
                rows={String(value).length > 80 ? 5 : 1}
                value={String(draft[key] ?? "")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [key]: typeof value === "number" ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {link && (
        <a href={link} className="mt-2 inline-block text-accent underline-offset-2 hover:underline">
          {t.open}
        </a>
      )}
      {proposal.state ? (
        <p className="mt-2 font-medium" role="status">
          {proposal.state === "executed"
            ? `${t.done}${proposal.note ? `: ${proposal.note}` : ""}`
            : proposal.state === "rejected"
              ? t.cancelled
              : t.failed}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void decide(true)} disabled={busy}>
            <CheckIcon /> {t.confirm}
          </Button>
          {editable.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(!editing)}
              disabled={busy}
            >
              <PencilIcon /> {editing ? t.stopEditing : t.edit}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void decide(false)} disabled={busy}>
            <XIcon /> {t.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The admin assistant (10 §3), opened from the top bar: questions and answers, and a preview
 * card for every change it proposes. The conversation stays for this browser tab.
 */
export function AssistantPanel({
  open,
  onOpenChange,
  question,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question typed in the top bar, asked when the panel opens. */
  question: { text: string; at: number } | null;
}) {
  // sessionStorage exists only in the browser; the closed panel renders nothing on the server.
  const [state, setState] = useState<{ sessionId: string; lines: Line[] } | null>(() =>
    typeof window === "undefined" ? null : load(),
  );
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const asked = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state) save(state);
    end.current?.scrollIntoView({ block: "end" });
  }, [state]);

  const ask = async (q: string) => {
    if (!state || !q.trim() || busy) return;
    const lines: Line[] = [...state.lines, { role: "user", text: q.trim() }];
    setState({ ...state, lines });
    setText("");
    setBusy(true);
    const res = await askAdminAssistant({
      sessionId: state.sessionId,
      lines: lines.map(({ role, text: body }) => ({ role, text: body })),
      page: `${window.location.pathname}${window.location.search}`,
    }).catch(() => null);
    setBusy(false);
    const reply: Line = res?.ok
      ? {
          role: "assistant",
          text: res.data.text,
          proposals: res.data.proposals,
          tools: res.data.tools.map((x) => x.name),
        }
      : { role: "assistant", text: res && !res.ok ? res.error : t.failedToAnswer };
    setState((s) => (s ? { ...s, lines: [...s.lines, reply] } : s));
  };

  useEffect(() => {
    if (open && question && question.at !== asked.current && state) {
      asked.current = question.at;
      void ask(question.text);
    }
    // `ask` reads the latest state; only a new question should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question, state]);

  const decided = (li: number, id: string, s: "executed" | "rejected" | "failed", note?: string) =>
    setState((cur) =>
      cur
        ? {
            ...cur,
            lines: cur.lines.map((l, i) =>
              i === li
                ? {
                    ...l,
                    proposals: l.proposals?.map((p) =>
                      p.id === id ? { ...p, state: s, note } : p,
                    ),
                  }
                : l,
            ),
          }
        : cur,
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" aria-hidden /> {t.title}
          </SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
          {state?.lines.length === 0 && <p className="text-[13px] text-text-muted">{t.empty}</p>}
          <ol aria-label={t.title} className="flex flex-col gap-3">
            {state?.lines.map((line, li) => (
              <li
                key={li}
                className={
                  line.role === "user"
                    ? "self-end rounded-xl bg-ink px-3 py-2 text-[13.5px] text-surface"
                    : "self-start text-[13.5px] text-ink"
                }
              >
                <span className="sr-only">{line.role === "user" ? t.you : t.title}: </span>
                <span className="whitespace-pre-wrap">{line.text}</span>
                {line.tools && line.tools.length > 0 && (
                  <span className="mt-1 block text-[12px] text-text-muted">
                    {t.used} {[...new Set(line.tools)].join(", ")}
                  </span>
                )}
                {line.proposals?.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onDecided={(s, note) => decided(li, p.id, s, note)}
                  />
                ))}
              </li>
            ))}
            {busy && (
              <li className="self-start text-[13px] text-text-muted" role="status">
                {t.thinking}
              </li>
            )}
          </ol>
          <div ref={end} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <Textarea
            aria-label={t.input}
            placeholder={admin.topbar.assistantPlaceholder}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(text);
              }
            }}
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            {t.send}
          </Button>
        </form>
        {state && state.lines.length > 0 && (
          <button
            type="button"
            className="pb-3 text-[12px] text-text-muted underline-offset-2 hover:underline"
            onClick={() => setState({ sessionId: crypto.randomUUID(), lines: [] })}
          >
            {t.clear}
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
