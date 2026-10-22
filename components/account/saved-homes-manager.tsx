"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import { notify } from "@/components/site/site-toaster";
import { Button } from "@/components/ui/button";
import {
  createSavedList,
  deleteSavedList,
  moveSavedHome,
  renameSavedList,
  setHomeSaved,
  setListShared,
  setSavedHomeNote,
} from "@/features/account/actions";
import type { ListingCardData } from "@/features/listings/cards";
import { account } from "@/lib/i18n/dictionaries/account";

export type ListView = {
  id: string;
  name: string;
  isDefault: boolean;
  shareToken: string | null;
  homes: number;
};
export type HomeView = {
  id: string;
  listId: string;
  note: string | null;
  card: ListingCardData | null;
  project: { id: string; name: string; slug: string } | null;
  /** "Price dropped by AED 50,000", "Now reserved". */
  change: string | null;
};

const t = account.savedPage;

function Home({
  home,
  lists,
  ctx,
  onChange,
}: {
  home: HomeView;
  lists: ListView[];
  ctx: CardContext;
  onChange: () => void;
}) {
  const [note, setNote] = useState(home.note ?? "");
  const label = home.card?.title ?? home.project?.name ?? "";
  return (
    <li className="flex flex-col gap-3">
      {home.card ? (
        <ListingCard listing={home.card} ctx={ctx} />
      ) : home.project ? (
        <a
          href={`/projects/${home.project.slug}`}
          className="rounded-[20px] bg-surface p-5 font-semibold text-ink shadow-soft hover:underline"
        >
          {t.project}: {home.project.name}
        </a>
      ) : null}
      {home.change && (
        <p className="rounded-full bg-accent/10 px-3 py-1 text-[13.5px] font-semibold text-accent">
          {home.change}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold text-ink">{t.note}</span>
        <textarea
          rows={2}
          maxLength={500}
          aria-label={`${t.note}: ${label}`}
          className="rounded-input border border-input bg-surface px-3 py-2 text-[14px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={async () => {
            if (note === (home.note ?? "")) return;
            const res = await setSavedHomeNote({ id: home.id, note });
            if (!res.ok) return notify.error(res.error);
            notify.success(t.noteSaved);
          }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {lists.length > 1 && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="font-semibold text-ink">{t.moveTo}</span>
            <select
              aria-label={`${t.moveTo}: ${label}`}
              className="h-9 rounded-input border border-input bg-surface px-2 text-[14px]"
              value={home.listId}
              onChange={async (e) => {
                const res = await moveSavedHome({ id: home.id, listId: e.target.value });
                if (!res.ok) return notify.error(res.error);
                onChange();
              }}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`${t.remove}: ${label}`}
          onClick={async () => {
            const res = await setHomeSaved({
              propertyId: home.card?.id ?? null,
              projectId: home.project?.id ?? null,
              saved: false,
            });
            if (!res.ok) return notify.error(res.error);
            onChange();
          }}
        >
          {t.remove}
        </Button>
      </div>
    </li>
  );
}

/** Saved homes (12 §2): lists, notes, moving between lists, sharing a list by link. */
export function SavedHomesManager({
  lists,
  homes,
  ctx,
  origin,
}: {
  lists: ListView[];
  homes: HomeView[];
  ctx: CardContext;
  origin: string;
}) {
  const router = useRouter();
  const [active, setActive] = useState(lists[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const list = lists.find((l) => l.id === active) ?? lists[0];
  const shown = homes.filter((h) => h.listId === list?.id);
  const refresh = () => router.refresh();
  const shareUrl = list?.shareToken ? `${origin}/lists/${list.shareToken}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lists">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={l.id === list?.id}
            onClick={() => setActive(l.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-[14px] font-semibold",
              l.id === list?.id
                ? "border-ink bg-ink text-surface"
                : "border-border bg-surface text-ink hover:border-ink/40",
            )}
          >
            {l.name} ({l.homes})
          </button>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await createSavedList({ name: newName });
            if (!res.ok) return notify.error(res.fieldErrors?.name?.[0] ?? res.error);
            setNewName("");
            setActive(res.data.id);
            refresh();
          }}
        >
          <input
            aria-label={t.listName}
            placeholder={t.newList}
            maxLength={60}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-10 w-40 rounded-full border border-input bg-surface px-4 text-[14px]"
          />
          <Button type="submit" variant="outline-site" size="sm" disabled={!newName.trim()}>
            {t.create}
          </Button>
        </form>
      </div>

      {list && (
        <div className="flex flex-wrap items-center gap-2">
          {renaming === list.id ? (
            <form
              className="flex items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name") as string;
                const res = await renameSavedList({ id: list.id, name });
                if (!res.ok) return notify.error(res.fieldErrors?.name?.[0] ?? res.error);
                setRenaming(null);
                refresh();
              }}
            >
              <input
                name="name"
                aria-label={t.listName}
                defaultValue={list.name}
                maxLength={60}
                className="h-9 rounded-input border border-input bg-surface px-3 text-[14px]"
              />
              <Button type="submit" size="sm">
                {t.rename}
              </Button>
            </form>
          ) : (
            !list.isDefault && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(list.id)}>
                {t.rename}
              </Button>
            )
          )}
          {!list.isDefault && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-danger"
              onClick={async () => {
                const res = await deleteSavedList({ id: list.id });
                if (!res.ok) return notify.error(res.error);
                setActive(lists[0]!.id);
                refresh();
              }}
            >
              {t.delete}
            </Button>
          )}
          <Button
            type="button"
            variant="outline-site"
            size="sm"
            onClick={async () => {
              const res = await setListShared({ id: list.id, shared: !list.shareToken });
              if (!res.ok) return notify.error(res.error);
              refresh();
            }}
          >
            {list.shareToken ? t.stopSharing : t.share}
          </Button>
          {shareUrl && (
            <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-text-muted">
              {t.shared}{" "}
              <code className="rounded bg-surface-muted px-2 py-1 text-ink">{shareUrl}</code>
              <button
                type="button"
                className="font-semibold text-accent underline-offset-4 hover:underline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    notify.success(t.copied);
                  } catch {
                    /* the link is on screen to copy by hand */
                  }
                }}
              >
                {t.copy}
              </button>
            </p>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-text-muted">{t.empty}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {shown.map((h) => (
            <Home key={h.id} home={h} lists={lists} ctx={ctx} onChange={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
