"use client";

import { HomeIcon, MessageSquareTextIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  replyToConversation,
  searchListingsForCards,
  sendListingMessage,
  sendTemplateReply,
} from "@/features/inbox/actions";
import type { QuickReply } from "@/features/inbox/queries";
import { composerMode } from "@/features/inbox/rules";
import { inbox as t } from "@/lib/i18n/dictionaries/inbox";
import { useAction } from "@/lib/use-action";

export type TemplateOption = { key: string; name: string; variables: string[] };

/**
 * Reply box (09 §6): free text with quick replies and listing cards; on WhatsApp outside the
 * 24-hour window it switches to approved templates with their variables.
 */
export function Composer({
  conversationId,
  channel,
  windowExpiresAt,
  contactName,
  quickReplies,
  templates,
}: {
  conversationId: string;
  channel: "web_chat" | "whatsapp" | "email";
  windowExpiresAt: string | null;
  contactName: string;
  quickReplies: QuickReply[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [picker, setPicker] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const mode = composerMode(channel, windowExpiresAt, now);
  const reply = useAction(replyToConversation, {
    success: t.toasts.queued,
    onSuccess: () => {
      setText("");
      router.refresh();
    },
  });

  if (mode === "template")
    return (
      <TemplateComposer
        conversationId={conversationId}
        contactName={contactName}
        templates={templates}
      />
    );

  return (
    <form
      className="flex flex-col gap-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) void reply.run({ conversationId, text });
      }}
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.composer.placeholder}
        aria-label={t.composer.placeholder}
        rows={3}
        maxLength={4000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) {
            e.preventDefault();
            void reply.run({ conversationId, text });
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={quickReplies.length === 0}>
              <MessageSquareTextIcon aria-hidden /> {t.actions.quickReplies}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-w-xs">
            {quickReplies.map((q) => (
              <DropdownMenuItem
                key={q.id}
                onSelect={() =>
                  setText((cur) => (cur.trim() ? `${cur.trimEnd()}\n${q.body}` : q.body))
                }
              >
                {q.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" size="sm" onClick={() => setPicker(true)}>
          <HomeIcon aria-hidden /> {t.actions.listingCard}
        </Button>
        <Button
          type="submit"
          size="sm"
          className="ms-auto"
          disabled={reply.pending || !text.trim()}
        >
          {t.actions.send}
        </Button>
      </div>
      <ListingPicker conversationId={conversationId} open={picker} onOpenChange={setPicker} />
    </form>
  );
}

function TemplateComposer({
  conversationId,
  contactName,
  templates,
}: {
  conversationId: string;
  contactName: string;
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [key, setKey] = useState(templates[0]?.key ?? "");
  const template = templates.find((x) => x.key === key);
  const [vars, setVars] = useState<Record<string, string>>({});
  const send = useAction(sendTemplateReply, {
    success: t.toasts.queued,
    onSuccess: () => {
      setVars({});
      router.refresh();
    },
  });
  return (
    <div className="flex flex-col gap-2 border-t border-border p-3">
      <p className="text-sm text-muted-foreground">{t.composer.windowClosed}</p>
      {templates.length === 0 ? (
        <p className="text-sm">{t.composer.noTemplates}</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send.run({ conversationId, key, variables: vars });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            {t.composer.template}
            <select
              className="rounded-md border border-border bg-background px-2 py-1.5"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              {templates.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.name} ({x.key})
                </option>
              ))}
            </select>
          </label>
          {template?.variables.map((v) => (
            <label key={v} className="flex flex-col gap-1 text-sm">
              {v}
              <Input
                value={vars[v] ?? (v === "name" ? (contactName.split(/\s+/)[0] ?? "") : "")}
                onChange={(e) => setVars((cur) => ({ ...cur, [v]: e.target.value }))}
              />
            </label>
          ))}
          <Button type="submit" size="sm" className="self-end" disabled={send.pending || !template}>
            {t.actions.sendTemplate}
          </Button>
        </form>
      )}
    </div>
  );
}

type Found = { id: string; reference: string; title: string; price: string };

function ListingPicker({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const search = useAction(searchListingsForCards, { onSuccess: setFound });
  const send = useAction(sendListingMessage, {
    success: t.toasts.queued,
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void search.run({ q }), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- search on open and on typing
  }, [open, q]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.actions.listingCard}</DialogTitle>
          <DialogDescription>{t.composer.pickListing}</DialogDescription>
        </DialogHeader>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t.composer.pickListing}
          placeholder="HD-1001"
        />
        {found && found.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.composer.noListings}</p>
        )}
        <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {(found ?? []).map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {l.reference} · {l.title}
                </span>
                <span className="text-xs text-muted-foreground">{l.price}</span>
              </span>
              <Button
                size="sm"
                disabled={send.pending}
                onClick={() => send.run({ conversationId, propertyId: l.id, kind: "card" })}
                aria-label={`${t.actions.send} ${l.reference}`}
              >
                {t.actions.send}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={send.pending}
                onClick={() => send.run({ conversationId, propertyId: l.id, kind: "brochure" })}
                aria-label={`${t.actions.brochure} ${l.reference}`}
              >
                {t.actions.brochure}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
