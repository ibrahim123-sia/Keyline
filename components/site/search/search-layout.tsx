"use client";

import { ListIcon, MapIcon, XIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import type { ListingCardData } from "@/features/listings/cards";
import type { SearchFilters } from "@/features/search/params";
import { search as t } from "@/lib/i18n/dictionaries/search";
import { SearchMap } from "./search-map";
import { getStored } from "@/lib/stored";

const LIST_ONLY_KEY = "propel.search.listOnly";
const STORAGE_EVENT = "propel:storage";

/** A boolean remembered in this browser (false on the server and in private mode). */
function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      window.addEventListener(STORAGE_EVENT, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(STORAGE_EVENT, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => {
      try {
        return getStored(localStorage, key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = (next: boolean) => {
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event(STORAGE_EVENT));
  };
  return [value, set];
}

/**
 * Results and map (06 §4.1): desktop list left and a sticky map right ("List only" hides
 * it); phones get a floating "Map" button for a full-screen map with a card for the chosen
 * pin. Hovering a card highlights its pin and the other way round.
 */
export function SearchLayout({
  children,
  pinsQuery,
  filters,
  styleUrl,
  center,
  zoom,
  ctx,
}: {
  children: ReactNode;
  pinsQuery: string;
  filters: SearchFilters;
  styleUrl: string;
  center: { lng: number; lat: number };
  zoom: number;
  ctx: CardContext;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [listOnly, setListOnly] = useStoredFlag(LIST_ONLY_KEY);
  const [mapOpen, setMapOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [card, setCard] = useState<ListingCardData | null>(null);

  const toggleListOnly = () => setListOnly(!listOnly);

  // Cards are server-rendered: mark the hovered one through its data attribute.
  useEffect(() => {
    listRef.current?.querySelectorAll<HTMLElement>("[data-listing-id]").forEach((el) => {
      el.dataset.highlight = el.dataset.listingId === hovered ? "true" : "false";
    });
  }, [hovered]);

  // The card for the chosen pin (it may be on another results page).
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetch(`/api/search/card?id=${selected}`)
      .then((r) => r.json() as Promise<{ card: ListingCardData | null }>)
      .then((d) => !cancelled && setCard(d.card))
      .catch(() => !cancelled && setCard(null));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const select = useCallback((id: string | null) => {
    setSelected(id);
    if (!id) setCard(null);
    const el = id ? listRef.current?.querySelector<HTMLElement>(`[data-listing-id="${id}"]`) : null;
    if (el && window.matchMedia("(min-width: 64rem)").matches)
      el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const shownCard = card && card.id === selected ? card : null;
  const mapProps = {
    pinsQuery,
    filters,
    styleUrl,
    center,
    zoom,
    ctx,
    hovered,
    selected,
    onHover: setHovered,
    onSelect: select,
  };

  return (
    <div
      className={cn(
        "relative mt-5 grid items-start gap-6",
        !listOnly && "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]",
      )}
    >
      <div
        ref={listRef}
        onMouseOver={(e) => {
          const el = (e.target as Element).closest<HTMLElement>("[data-listing-id]");
          setHovered(el?.dataset.listingId ?? null);
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <div className="mb-3 hidden justify-end lg:flex">
          <button
            type="button"
            onClick={toggleListOnly}
            aria-pressed={listOnly}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink/30"
          >
            {listOnly ? (
              <MapIcon className="size-4" aria-hidden />
            ) : (
              <ListIcon className="size-4" aria-hidden />
            )}
            {listOnly ? t.map.showMap : t.map.listOnly}
          </button>
        </div>
        {children}
      </div>

      {!listOnly && (
        <div className="sticky top-[88px] hidden h-[calc(100vh-112px)] lg:block">
          <SearchMap {...mapProps} className="h-full rounded-[20px]">
            {shownCard && <SelectedCard card={shownCard} ctx={ctx} onClose={() => select(null)} />}
          </SearchMap>
        </div>
      )}

      {/* Phones: a floating button opens a full-screen map. */}
      <button
        type="button"
        onClick={() => setMapOpen(true)}
        className="fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-surface shadow-pin lg:hidden"
      >
        <MapIcon className="size-4" aria-hidden />
        {t.map.show}
      </button>
      {mapOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-bg lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t.map.label}
        >
          <SearchMap {...mapProps} lazy={false} className="min-h-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setMapOpen(false);
                select(null);
              }}
              className="absolute top-3 left-3 z-10 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-surface shadow-pin"
            >
              <ListIcon className="size-4" aria-hidden />
              {t.map.hide}
            </button>
            {shownCard && <SelectedCard card={shownCard} ctx={ctx} onClose={() => select(null)} />}
          </SearchMap>
        </div>
      )}
    </div>
  );
}

function SelectedCard({
  card,
  ctx,
  onClose,
}: {
  card: ListingCardData;
  ctx: CardContext;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-3 z-10" role="region" aria-label={t.map.selected}>
      <div className="relative mx-auto max-w-md">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.map.close}
          className="absolute -top-3 -right-1 z-[2] inline-flex size-8 items-center justify-center rounded-full bg-ink text-surface shadow-pin"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
        <ListingCard
          listing={card}
          ctx={ctx}
          layout="row"
          sizes="(min-width: 640px) 320px, 100vw"
        />
      </div>
    </div>
  );
}
