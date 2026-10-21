"use client";

import { CopyIcon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CheckboxListField, SwitchField, TextareaField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { relativeTime } from "@/features/leads/filters";
import { sendShortlist } from "@/features/shortlists/actions";
import { useAction } from "@/lib/use-action";

type Home = { id: string; reference: string; title: string; price: string };

/** Send properties (09 §4): pick homes, add a note, email the link (or copy it). */
export function SendHomes({
  leadId,
  homes,
  hasEmail,
}: {
  leadId: string;
  homes: Home[];
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(hasEmail);
  const [sent, setSent] = useState<{ url: string; emailed: boolean } | null>(null);
  const { run, pending, errorFor } = useAction(sendShortlist, {
    onSuccess: (d) => {
      setSent({ url: d.url, emailed: d.emailed });
      toast.success(d.emailed ? `${d.count} homes sent` : "Shortlist link ready");
      router.refresh();
    },
  });
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setPicked(homes.map((h) => h.id));
          setSent(null);
          setOpen(true);
        }}
      >
        <SendIcon aria-hidden /> Send to lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send homes</DialogTitle>
            <DialogDescription>
              They get a personal link; you see when they open it and which homes they look at.
            </DialogDescription>
          </DialogHeader>
          {sent ? (
            <div className="flex flex-col gap-3 text-[13.5px]">
              <p>{sent.emailed ? "Emailed. The link:" : "The link to send:"}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-[12.5px]">
                  {sent.url}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(sent.url)
                      .then(() => toast.success("Link copied"))
                  }
                >
                  <CopyIcon aria-hidden /> Copy
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <CheckboxListField
                label="Homes"
                value={picked}
                onChange={setPicked}
                options={homes.map((h) => ({
                  value: h.id,
                  label: `${h.reference} · ${h.title} · ${h.price}`,
                }))}
                error={errorFor("propertyIds")}
              />
              <TextareaField
                label="Note to them"
                value={message}
                onChange={setMessage}
                rows={3}
                maxLength={2000}
              />
              <SwitchField
                label="Email it to them"
                description={hasEmail ? undefined : "No email address yet: copy the link instead."}
                checked={email && hasEmail}
                onChange={setEmail}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={pending || picked.length === 0}
                  onClick={() =>
                    run({ leadId, propertyIds: picked, message, email: email && hasEmail })
                  }
                >
                  {email && hasEmail ? "Send" : "Make the link"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export type ShortlistItem = {
  id: string;
  token: string;
  createdAt: string;
  count: number;
  references: string[];
  viewed: string[];
  openCount: number;
  lastOpenedAt: string | null;
};

export function Shortlists({ items, now }: { items: ShortlistItem[]; now: string }) {
  if (items.length === 0) return null;
  const at = new Date(now);
  return (
    <section
      aria-labelledby="lead-shortlists"
      className="rounded-lg border border-border bg-surface"
    >
      <header className="border-b border-border px-4 py-2.5">
        <h2 id="lead-shortlists" className="text-[13px] font-semibold text-ink">
          Homes sent
        </h2>
      </header>
      <ul className="flex flex-col gap-2 px-4 py-3 text-[13px]">
        {items.map((s) => (
          <li key={s.id}>
            <p className="text-ink">
              {s.count} {s.count === 1 ? "home" : "homes"} · {relativeTime(s.createdAt, at)} ·{" "}
              <a
                href={`/s/${s.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                link
              </a>
            </p>
            <p className="text-[12px] text-text-muted">
              {s.openCount === 0
                ? "Not opened yet"
                : `Opened ${s.openCount} ${s.openCount === 1 ? "time" : "times"}, last ${relativeTime(s.lastOpenedAt!, at)}`}
              {s.viewed.length > 0 ? ` · looked at ${s.viewed.join(", ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
