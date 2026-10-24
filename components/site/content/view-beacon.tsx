"use client";

import { useEffect } from "react";

/** Counts one view of a post per browser tab session (the admin's "views" column). */
export function ViewBeacon({ postId }: { postId: string }) {
  useEffect(() => {
    const key = `keyline.viewed.${postId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode: count it anyway */
    }
    const body = JSON.stringify({ id: postId });
    if (!navigator.sendBeacon?.("/api/insights/view", body))
      void fetch("/api/insights/view", { method: "POST", body, keepalive: true }).catch(() => {});
  }, [postId]);
  return null;
}
