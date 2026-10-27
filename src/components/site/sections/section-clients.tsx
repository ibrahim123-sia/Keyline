"use client";

import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { BaseMap, type LngLat, type MapLibreModule } from "@/components/maps/base-map";
import type { SanitizedScript } from "@/lib/html-sanitize";
import { cms } from "@/lib/i18n/dictionaries/cms";

/** Small client parts of the page builder's sections (everything else renders on the server). */

/** A row that scrolls sideways with snap points, plus previous/next buttons on wide screens. */
export function Carousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };
  return (
    <div className="relative">
      <ul
        ref={track}
        aria-label={label}
        className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-5 pb-2 md:mx-0 md:px-0 [&>li]:w-[85%] [&>li]:shrink-0 [&>li]:snap-start sm:[&>li]:w-[45%] lg:[&>li]:w-[31.5%]"
      >
        {children}
      </ul>
      <div className="mt-4 hidden justify-end gap-2 md:flex">
        <button
          type="button"
          aria-label={cms.gallery.previous}
          onClick={() => scroll(-1)}
          className="flex size-10 items-center justify-center rounded-full border border-current/20 hover:border-current/50"
        >
          <ChevronLeftIcon className="size-5 rtl:rotate-180" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={cms.gallery.next}
          onClick={() => scroll(1)}
          className="flex size-10 items-center justify-center rounded-full border border-current/20 hover:border-current/50"
        >
          <ChevronRightIcon className="size-5 rtl:rotate-180" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * A YouTube or Vimeo video behind its poster: the player (and its cookies) only loads when the
 * visitor presses play. Files play in a plain <video>.
 */
export function VideoFacade({
  embedUrl,
  title,
  poster,
  aspect,
}: {
  embedUrl: string;
  title: string;
  poster: ReactNode;
  aspect: string;
}) {
  const [playing, setPlaying] = useState(false);
  if (playing)
    return (
      <iframe
        src={`${embedUrl}${embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="w-full rounded-[20px] border-0 bg-ink"
        style={{ aspectRatio: aspect }}
      />
    );
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`${cms.video.play}${title ? `: ${title}` : ""}`}
      className="group relative block w-full overflow-hidden rounded-[20px] bg-ink"
      style={{ aspectRatio: aspect }}
    >
      {poster}
      <span className="absolute inset-0 flex items-center justify-center bg-ink/20 transition-colors group-hover:bg-ink/35">
        <span className="flex size-16 items-center justify-center rounded-full bg-surface text-ink shadow-soft">
          <PlayIcon className="ms-1 size-7" aria-hidden />
        </span>
      </span>
    </button>
  );
}

export type MapPin = { id: string; lng: number; lat: number; href?: string; label?: string };

/** The map section: the office, listing pins and nearby places (loads when scrolled near). */
export function SectionMap({
  styleUrl,
  center,
  zoom,
  office,
  listings,
  places,
  label,
  height,
}: {
  styleUrl: string;
  center: LngLat;
  zoom: number;
  office: LngLat | null;
  listings: MapPin[];
  places: MapPin[];
  label: string;
  height: "small" | "medium" | "large";
}) {
  const onReady = (map: MapLibreMap, maplibre: MapLibreModule) => {
    for (const p of places) {
      const dot = document.createElement("div");
      dot.className = "size-3 rounded-full border-2 border-white bg-[var(--color-ink)]";
      dot.title = p.label ?? "";
      new maplibre.Marker({ element: dot }).setLngLat([p.lng, p.lat]).addTo(map);
    }
    for (const p of listings) {
      const pin = document.createElement("a");
      pin.href = p.href ?? "#";
      pin.className =
        "block size-3.5 rounded-full border-2 border-white bg-[var(--color-accent)] shadow-pin";
      pin.setAttribute("aria-label", p.label ?? "Listing");
      new maplibre.Marker({ element: pin }).setLngLat([p.lng, p.lat]).addTo(map);
    }
    if (office) {
      const el = document.createElement("div");
      el.className =
        "flex items-center gap-1 rounded-full bg-[var(--color-ink)] px-2.5 py-1 text-[12px] font-semibold text-white shadow-pin";
      el.textContent = cms.map.office;
      new maplibre.Marker({ element: el }).setLngLat([office.lng, office.lat]).addTo(map);
    }
  };
  return (
    <BaseMap
      styleUrl={styleUrl}
      center={center}
      zoom={zoom}
      label={label}
      onReady={onReady}
      className={cn(
        "w-full overflow-hidden rounded-[20px]",
        height === "small" && "h-64 md:h-72",
        height === "medium" && "h-80 md:h-[420px]",
        height === "large" && "h-[420px] md:h-[560px]",
      )}
    />
  );
}

/**
 * Scripts from a custom HTML section, when Settings -> Security allows them: added after the
 * page loads (and again after a client-side navigation), one after another in their order.
 */
export function CustomHtmlScripts({ scripts }: { scripts: SanitizedScript[] }) {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = anchor.current?.parentElement;
    if (!host) return;
    const added: HTMLScriptElement[] = [];
    let cancelled = false;
    void (async () => {
      for (const s of scripts) {
        if (cancelled) return;
        const el = document.createElement("script");
        if ("src" in s) {
          el.src = s.src;
          el.async = false;
          await new Promise<void>((resolve) => {
            el.onload = () => resolve();
            el.onerror = () => resolve();
            host.appendChild(el);
          });
        } else {
          el.text = s.code;
          host.appendChild(el);
        }
        added.push(el);
      }
    })();
    return () => {
      cancelled = true;
      for (const el of added) el.remove();
    };
  }, [scripts]);
  return <span ref={anchor} hidden />;
}
