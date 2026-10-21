"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import type { SiteLink } from "@/features/menus/schema";
import { format, site } from "@/lib/i18n";
import { MenuLink } from "./menu-link";

/**
 * Header link with dropdown links (08 §2, disclosure pattern): the label stays a link, the
 * chevron button opens the list. Opens on hover too; Escape or leaving closes it.
 */
export function NavDropdown({ link }: { link: SiteLink }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Opened by the pointer resting on it: the click that usually follows keeps it open.
  const byHover = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <li
      ref={root}
      className="relative"
      onMouseEnter={() => {
        if (!open) byHover.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        byHover.current = false;
        setOpen(false);
      }}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="flex items-center gap-0.5">
        <MenuLink link={link} />
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={format(site.a11y.submenu, { label: link.label })}
          onClick={() => {
            if (byHover.current) byHover.current = false;
            else setOpen((o) => !o);
          }}
          className="flex size-7 items-center justify-center rounded-full text-ink hover:text-accent"
        >
          <ChevronDownIcon
            className={cn("size-4 transition-transform duration-150", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </div>
      {/* The padding (not a margin) keeps the pointer inside while moving down to the list. */}
      <div id={id} hidden={!open} className="absolute start-0 top-full z-40 pt-2">
        <ul className="min-w-56 rounded-[16px] border border-border bg-surface p-2 shadow-soft">
          {link.children.map((c, i) => (
            <li key={`${i}-${c.href}`}>
              <MenuLink
                link={c}
                className="block rounded-[10px] px-3 py-2 text-[15px] text-ink hover:bg-surface-soft hover:text-accent"
              />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
