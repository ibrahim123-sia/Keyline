"use client";

import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCompareHome } from "@/features/account/actions";
import { compare as t } from "@/lib/i18n/dictionaries/compare";
import { patchMe } from "../account/me";
import { notify } from "../site-toaster";

/** Takes a home off the visitor's own comparison and redraws the table. */
export function RemoveFromCompare({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`${t.remove}: ${label}`}
      onClick={() =>
        start(async () => {
          const res = await toggleCompareHome({ propertyId: id });
          if (!res.ok) return void notify.error(res.error);
          patchMe((m) => ({ ...m, compare: res.data.ids }));
          router.refresh();
        })
      }
      className="inline-flex size-8 items-center justify-center rounded-full bg-surface/90 text-ink shadow-soft hover:bg-surface disabled:opacity-50"
    >
      <XIcon className="size-4" aria-hidden />
    </button>
  );
}
