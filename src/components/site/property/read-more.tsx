"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

/**
 * Long descriptions fold to a few lines with "Read more" (06 §5.5). The full text is in the
 * page from the start (search engines and screen readers get all of it); only its height
 * changes. Short texts show no button.
 */
export function ReadMore({
  children,
  more,
  less,
}: {
  children: ReactNode;
  more: string;
  less: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 24);
  }, []);
  return (
    <div>
      <div
        ref={box}
        className={cn(
          "relative overflow-hidden",
          !open && "max-h-[18rem]",
          !open &&
            long &&
            "after:absolute after:inset-x-0 after:bottom-0 after:h-16 after:bg-gradient-to-t after:from-bg after:to-transparent",
        )}
      >
        {children}
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-[15px] font-semibold text-accent underline-offset-4 hover:underline"
        >
          {open ? less : more}
        </button>
      )}
    </div>
  );
}
