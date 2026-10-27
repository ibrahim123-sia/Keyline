"use client";

import { MessageCircleIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { chat as t } from "@/lib/i18n/dictionaries/chat";

// The panel's code loads only when someone opens the chat (no cost on first paint).
const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel), { ssr: false });

/** The chat button on every site page (09 §1 #3); shown only when Settings turns it on. */
export function ChatLauncher(props: {
  title: string;
  greeting: string;
  askContactFirst: boolean;
  humanButton: "always" | "after_3";
}) {
  const [open, setOpen] = useState(false);
  return open ? (
    <ChatPanel {...props} onClose={() => setOpen(false)} />
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      className="fixed end-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-[14px] font-semibold text-surface shadow-pin hover:bg-ink-soft lg:bottom-6 print:hidden"
    >
      <MessageCircleIcon className="size-4" aria-hidden />
      {t.open}
    </button>
  );
}
