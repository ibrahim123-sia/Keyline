"use client";

import { ColumnsIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { toggleCompareHome } from "@/features/account/actions";
import { account } from "@/lib/i18n/dictionaries/account";
import { notify } from "../site-toaster";
import { loadMe, patchMe, useMe } from "./me";

/** "Add to compare" (up to 4); works for guests too (kept by the visitor id). */
export function CompareButton({ propertyId, label }: { propertyId: string; label: string }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const inSet = Boolean(me?.compare.includes(propertyId));
  return (
    <button
      type="button"
      aria-pressed={inSet}
      aria-label={`${inSet ? account.compare.removeLabel : account.compare.addLabel}: ${label}`}
      disabled={busy}
      onClick={async () => {
        await loadMe();
        setBusy(true);
        const res = await toggleCompareHome({ propertyId });
        setBusy(false);
        if (!res.ok) return notify.error(res.error);
        patchMe((m) => ({ ...m, compare: res.data.ids }));
      }}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors",
        inSet
          ? "border-ink bg-ink text-surface"
          : "border-ink/15 bg-surface text-ink hover:border-ink/40",
      )}
    >
      <ColumnsIcon aria-hidden className="size-4" />
      {inSet ? account.compare.added : account.compare.add}
    </button>
  );
}
