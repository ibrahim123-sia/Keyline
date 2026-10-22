"use client";

import { HeartIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { cn } from "cn";
import { setHomeSaved } from "@/features/account/actions";
import { account } from "@/lib/i18n/dictionaries/account";
import { notify } from "../site-toaster";
import { loadMe, patchMe, useMe } from "./me";
import { setPending } from "./pending";

const AuthPrompt = dynamic(() => import("./auth-prompt").then((m) => m.AuthPrompt), {
  ssr: false,
});

/** The heart (12 §2 Saved homes): save or unsave a listing or project. */
export function SaveHomeButton({
  propertyId,
  projectId,
  label,
  variant = "card",
}: {
  propertyId?: string;
  projectId?: string;
  /** What is being saved, for screen readers ("Save Marina Gate two bed"). */
  label: string;
  variant?: "card" | "page";
}) {
  const me = useMe();
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState(false);
  const saved = Boolean(
    me &&
    (propertyId
      ? me.saved.properties.includes(propertyId)
      : projectId && me.saved.projects.includes(projectId)),
  );

  const toggle = async () => {
    const current = me ?? (await loadMe());
    if (!current?.signedIn) {
      setPending({ kind: "save-home", propertyId, projectId });
      setPrompt(true);
      return;
    }
    setBusy(true);
    const next = !saved;
    const res = await setHomeSaved({ propertyId, projectId, saved: next });
    setBusy(false);
    if (!res.ok) return notify.error(res.error);
    patchMe((m) => {
      const key = propertyId ? "properties" : "projects";
      const id = (propertyId ?? projectId)!;
      const ids = m.saved[key].filter((x) => x !== id);
      return { ...m, saved: { ...m.saved, [key]: next ? [...ids, id] : ids } };
    });
    notify.success(next ? account.save.saved : account.save.removed);
  };

  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={`${saved ? account.save.unsaveLabel : account.save.saveLabel}: ${label}`}
        disabled={busy}
        onClick={() => void toggle()}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold transition-colors",
          variant === "card"
            ? "size-9 rounded-full bg-surface/95 text-ink shadow-pin hover:bg-surface"
            : "h-10 rounded-full border border-ink/15 bg-surface px-4 text-[14px] text-ink hover:border-ink/40",
        )}
      >
        <HeartIcon aria-hidden className={cn("size-[18px]", saved && "fill-accent text-accent")} />
        {variant === "page" && (saved ? account.save.savedShort : account.save.saveShort)}
      </button>
      {prompt && (
        <AuthPrompt title={account.save.promptTitle} open={prompt} onOpenChange={setPrompt} />
      )}
    </>
  );
}
