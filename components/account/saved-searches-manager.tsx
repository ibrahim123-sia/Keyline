"use client";

import { useRouter } from "next/navigation";
import { notify } from "@/components/site/site-toaster";
import { Button } from "@/components/ui/button";
import { editSavedSearch, removeSavedSearch } from "@/features/account/actions";
import type { SavedSearchView } from "@/features/account/queries";
import { format } from "@/lib/i18n";
import { account } from "@/lib/i18n/dictionaries/account";

const t = account.searchesPage;

/** A small outline of a drawn area. */
function AreaThumb({ ring }: { ring: Array<[number, number]> }) {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const points = ring
    .map(
      ([x, y]) =>
        `${(((x - minX) / span) * 56 + 4).toFixed(1)},${(((maxY - y) / span) * 56 + 4).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 shrink-0 rounded-lg bg-surface-muted"
      role="img"
      aria-label={t.drawnArea}
    >
      <polygon points={points} className="fill-accent/20 stroke-accent" strokeWidth={2} />
    </svg>
  );
}

/** Saved searches (12 §2): name, filters, area, alert frequency, new matches; edit, delete. */
export function SavedSearchesManager({ searches }: { searches: SavedSearchView[] }) {
  const router = useRouter();
  if (searches.length === 0) return <p className="text-text-muted">{t.empty}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {searches.map((s) => (
        <li
          key={s.id}
          className="flex flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-soft sm:flex-row sm:items-start"
        >
          {s.ring && <AreaThumb ring={s.ring} />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name") as string;
                const res = await editSavedSearch({ id: s.id, name });
                if (!res.ok) return notify.error(res.fieldErrors?.name?.[0] ?? res.error);
                notify.success(t.renamed);
                router.refresh();
              }}
            >
              <input
                name="name"
                aria-label={account.searches.name}
                defaultValue={s.name}
                maxLength={80}
                className="h-10 min-w-0 flex-1 rounded-input border border-input bg-surface px-3 text-[15px] font-semibold"
              />
              <Button type="submit" variant="ghost" size="sm">
                {account.profilePage.save}
              </Button>
            </form>
            <p className="text-[14px] text-text-muted">{s.summary}</p>
            <p className="text-[14px] font-semibold text-ink">
              {s.newMatches ? format(t.newMatches, { count: s.newMatches }) : t.noNew}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={s.href}
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                {t.open}
              </a>
              <label className="flex items-center gap-2 text-[14px]">
                <span className="font-semibold text-ink">{t.alerts}</span>
                <select
                  aria-label={`${t.alerts}: ${s.name}`}
                  className="h-9 rounded-input border border-input bg-surface px-2 text-[14px]"
                  defaultValue={s.frequency}
                  onChange={async (e) => {
                    const res = await editSavedSearch({
                      id: s.id,
                      frequency: e.target.value as SavedSearchView["frequency"],
                    });
                    if (!res.ok) return notify.error(res.error);
                    notify.success(t.renamed);
                  }}
                >
                  {(["instant", "daily", "weekly", "off"] as const).map((f) => (
                    <option key={f} value={f}>
                      {account.searches.frequencies[f]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                aria-label={`${t.delete}: ${s.name}`}
                onClick={async () => {
                  const res = await removeSavedSearch({ id: s.id });
                  if (!res.ok) return notify.error(res.error);
                  notify.success(t.deleted);
                  router.refresh();
                }}
              >
                {t.delete}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
