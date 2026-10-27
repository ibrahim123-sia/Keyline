"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";

/** Sticky header that gains a white background and border once the page scrolls. */
export function StickyHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-200",
        scrolled ? "border-b border-border bg-surface/95 backdrop-blur" : "bg-bg",
      )}
    >
      {children}
    </header>
  );
}
