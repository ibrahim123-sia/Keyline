"use client";

import { ColumnsIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { saveCurrentSearch, setHomeSaved } from "@/features/account/actions";
import { format } from "@/lib/i18n";
import { account } from "@/lib/i18n/dictionaries/account";
import { notify } from "../site-toaster";
import { patchMe, useMe } from "./me";
import { takePending } from "./pending";

/**
 * The compare tray (a small bar while homes are picked to compare), and the finishing of a
 * save a guest started before signing in (12 §1). On every site page.
 */
export function CompareTray() {
  const me = useMe();
  const ran = useRef(false);

  useEffect(() => {
    if (!me?.signedIn || ran.current) return;
    ran.current = true;
    const pending = takePending();
    if (!pending) return;
    void (async () => {
      if (pending.kind === "save-home") {
        const res = await setHomeSaved({ ...pending, saved: true });
        if (!res.ok) return notify.error(res.error);
        patchMe((m) => {
          const key = pending.propertyId ? "properties" : "projects";
          const id = (pending.propertyId ?? pending.projectId)!;
          return { ...m, saved: { ...m.saved, [key]: [...m.saved[key], id] } };
        });
        notify.success(account.save.saved);
      } else {
        const res = await saveCurrentSearch({
          query: pending.query,
          name: pending.name,
          frequency: "daily",
        });
        if (!res.ok) return notify.error(res.error);
        notify.success(account.searches.saved);
      }
    })();
  }, [me?.signedIn]);

  if (!me || me.compare.length === 0) return null;
  return (
    <div className="fixed start-4 bottom-20 z-30 lg:bottom-6 print:hidden">
      <a
        href="/tools/compare"
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-surface shadow-pin"
      >
        <ColumnsIcon aria-hidden className="size-4" />
        {format(account.compare.tray, { count: me.compare.length })}
      </a>
    </div>
  );
}
