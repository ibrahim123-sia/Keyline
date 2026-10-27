"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { newRefCode, withRefCode } from "@/features/attribution/whatsapp-ref";
import { track, type TrackEvent } from "./visitor-tracker";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  kind: "whatsapp" | "call";
  /** What the chat is about (a listing reference, a project), put in the WhatsApp ref code. */
  refLabel?: string;
  entityType?: TrackEvent["entityType"];
  entityId?: string;
};

/**
 * A WhatsApp or call link that records the click (09 §1 #4, #8). WhatsApp messages get a
 * "[label·code]" reference at click time, so the chat can be matched to this visitor.
 */
export function TrackedContactLink({
  kind,
  refLabel,
  entityType,
  entityId,
  onClick,
  href,
  ...rest
}: Props) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (kind === "whatsapp") {
      const code = newRefCode();
      if (refLabel) e.currentTarget.href = withRefCode(href, refLabel, code);
      track({
        type: "whatsapp_click",
        entityType,
        entityId,
        meta: { ref: refLabel ? code : null, label: refLabel ?? null },
      });
    } else track({ type: "call_click", entityType, entityId });
  };
  return <a {...rest} href={href} onClick={handle} />;
}
