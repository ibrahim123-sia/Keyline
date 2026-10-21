"use client";

import { useState } from "react";
import { FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { cancelViewingAction, rescheduleViewingAction } from "@/features/viewings/actions";
import { format } from "@/lib/i18n";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";
import { SlotPicker } from "./slot-picker";

const longTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Move or cancel a viewing from its private link (09 §5, no login needed). */
export function ManageViewing({ token, bookUrl }: { token: string; bookUrl: string }) {
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [start, setStart] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [done, setDone] = useState<"moved" | "cancelled" | null>(null);

  if (done === "cancelled")
    return (
      <div className="flex flex-col gap-3">
        <FormAlert tone="success">{t.manage.cancelled}</FormAlert>
        <Button asChild variant="outline-site" size="md">
          <a href={bookUrl}>{t.manage.bookAgain}</a>
        </Button>
      </div>
    );

  const move = async () => {
    if (!start) return setMessage({ tone: "error", text: t.booking.pickTime });
    setBusy(true);
    const res = await rescheduleViewingAction({ token, start });
    setBusy(false);
    if (res.ok) {
      setDone("moved");
      setMode("idle");
      return setMessage({
        tone: "success",
        text: format(t.manage.moved, { when: longTime(start) }),
      });
    }
    if (res.code === "SLOT_TAKEN") {
      setStart(null);
      setReload((n) => n + 1);
      return setMessage({ tone: "error", text: t.booking.taken });
    }
    setMessage({ tone: "error", text: res.error });
  };

  const cancel = async () => {
    setBusy(true);
    const res = await cancelViewingAction({ token });
    setBusy(false);
    if (res.ok) return setDone("cancelled");
    setMessage({ tone: "error", text: res.error });
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
      {mode === "move" && (
        <div className="flex flex-col gap-4">
          <SlotPicker
            source={`viewing=${token}`}
            value={start}
            onChange={setStart}
            reloadKey={reload}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="md" disabled={busy} onClick={() => void move()}>
              {t.manage.move}
            </Button>
            <Button variant="ghost" size="md" onClick={() => setMode("idle")}>
              {t.manage.back}
            </Button>
          </div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="flex flex-wrap gap-2">
          <Button size="md" variant="destructive" disabled={busy} onClick={() => void cancel()}>
            {t.manage.cancelConfirm}
          </Button>
          <Button variant="ghost" size="md" onClick={() => setMode("idle")}>
            {t.manage.back}
          </Button>
        </div>
      )}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button size="md" variant="outline-site" onClick={() => setMode("move")}>
            {t.manage.move}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="text-danger"
            onClick={() => setMode("cancel")}
          >
            {t.manage.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}
