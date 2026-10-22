"use client";

import { XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { startChat, sendChatMessage } from "@/features/chat/actions";
import type { ChatMessage } from "@/features/chat/schema";
import { chat as t } from "@/lib/i18n/dictionaries/chat";

type Poll = { enabled: boolean; conversation: { id: string } | null; messages: ChatMessage[] };

const field =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * The chat window (09 §1 #3): the first message (with name and email or phone when Settings
 * asks) starts a conversation in the inbox; replies appear here, polled every few seconds.
 */
export function ChatPanel({
  title,
  greeting,
  askContactFirst,
  onClose,
}: {
  title: string;
  greeting: string;
  askContactFirst: boolean;
  onClose: () => void;
}) {
  const [started, setStarted] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "", website: "" });
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLLIElement>(null);

  const load = useCallback(async (full = false) => {
    try {
      const after = !full && last.current ? `?after=${encodeURIComponent(last.current)}` : "";
      const res = await fetch(`/api/chat${after}`, { cache: "no-store" });
      const data = (await res.json()) as Poll;
      if (!data.conversation) return setStarted(false);
      setStarted(true);
      if (data.messages.length) {
        last.current = data.messages.at(-1)!.createdAt;
        setMessages((cur) =>
          full
            ? data.messages
            : [...cur, ...data.messages.filter((m) => !cur.some((c) => c.id === m.id))],
        );
      }
    } catch {
      // Offline for a moment: the next poll tries again.
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(true), 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("input, textarea")?.focus();
  }, [started]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const submitStart = async () => {
    setBusy(true);
    setError(null);
    const res = await startChat(form).catch(() => null);
    setBusy(false);
    if (!res) return setError(t.failed);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return setError(res.error);
    }
    setErrors({});
    await load(true);
  };
  const submitMessage = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const res = await sendChatMessage({ text }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(res && !res.ok ? res.error : t.failed);
    setText("");
    await load();
  };
  const err = (k: string) =>
    errors[k]?.[0] ? <span className="text-[13px] text-red-700">{errors[k]![0]}</span> : null;

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="fixed inset-x-0 bottom-0 z-[45] flex max-h-[85dvh] flex-col rounded-t-[20px] border border-border bg-surface shadow-soft sm:inset-x-auto sm:end-6 sm:bottom-6 sm:w-[24rem] sm:rounded-[20px] print:hidden"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-[18px] text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="ms-auto rounded-full p-1.5 hover:bg-surface-muted"
        >
          <XIcon className="size-5" aria-hidden />
        </button>
      </header>
      <ol
        aria-label={title}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 text-[15px]"
      >
        <li className="max-w-[85%] self-start rounded-2xl bg-surface-muted px-3 py-2 text-ink">
          {greeting}
        </li>
        {messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-wrap",
              m.mine ? "self-end bg-ink text-surface" : "self-start bg-surface-muted text-ink",
            )}
          >
            <span className="sr-only">
              {m.mine ? t.you : m.sender === "ai" ? t.assistant : t.team}:{" "}
            </span>
            {m.body}
          </li>
        ))}
        {started && messages.length > 0 && messages.every((m) => m.mine) && (
          <li className="self-start text-[13px] text-text-muted">{t.waiting}</li>
        )}
        <li ref={end} aria-hidden />
      </ol>
      {started === false && (
        <form
          className="flex flex-col gap-2 border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitStart();
          }}
        >
          {askContactFirst && <p className="text-[13px] text-text-muted">{t.intro}</p>}
          {askContactFirst && (
            <>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
                {t.name}
                <input
                  className={field}
                  value={form.name}
                  autoComplete="name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {err("name")}
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
                {t.email}
                <input
                  className={field}
                  type="email"
                  value={form.email}
                  autoComplete="email"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {err("email")}
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
                {t.phone}
                <input
                  className={field}
                  type="tel"
                  value={form.phone}
                  autoComplete="tel"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {err("phone")}
              </label>
            </>
          )}
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-ink">
            {t.message}
            <textarea
              className={field}
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
            {err("message")}
          </label>
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            className="hidden"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          {error && <p className="text-[13px] text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-ink px-4 py-2.5 text-[15px] font-semibold text-surface disabled:opacity-60"
          >
            {t.start}
          </button>
        </form>
      )}
      {started && (
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitMessage();
          }}
        >
          <textarea
            className={cn(field, "min-h-11 flex-1")}
            rows={1}
            aria-label={t.message}
            placeholder={t.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitMessage();
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-full bg-ink px-4 py-2.5 text-[15px] font-semibold text-surface disabled:opacity-60"
          >
            {t.send}
          </button>
        </form>
      )}
      {started && error && <p className="px-4 pb-3 text-[13px] text-red-700">{error}</p>}
    </div>
  );
}
