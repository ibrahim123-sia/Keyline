"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { LightboxMedia, LightboxTab } from "./lightbox";

// The viewer's code only loads the first time someone opens it (good for LCP and INP).
const Lightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), { ssr: false });

type OpenAt = { tab: LightboxTab; index: number };
const Ctx = createContext<(at: OpenAt) => void>(() => {});

/** Holds the full-screen viewer; any `LightboxTrigger` inside opens it at a tab and photo. */
export function LightboxProvider({
  media,
  title,
  children,
}: {
  media: LightboxMedia;
  title: string;
  children: ReactNode;
}) {
  const [at, setAt] = useState<(OpenAt & { n: number }) | null>(null);
  const open = (next: OpenAt) => setAt((prev) => ({ ...next, n: (prev?.n ?? 0) + 1 }));
  return (
    <Ctx.Provider value={open}>
      {children}
      {at && (
        <Lightbox
          key={at.n}
          media={media}
          title={title}
          tab={at.tab}
          index={at.index}
          onClose={() => setAt(null)}
        />
      )}
    </Ctx.Provider>
  );
}

/** A button around a gallery image (or a label) that opens the viewer. */
export function LightboxTrigger({
  tab = "photos",
  index = 0,
  label,
  className,
  children,
}: {
  tab?: LightboxTab;
  index?: number;
  /** Accessible name when the content is only an image. */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(Ctx);
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      className={className}
      onClick={() => open({ tab, index })}
    >
      {children}
    </button>
  );
}
