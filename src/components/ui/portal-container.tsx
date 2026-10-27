"use client";

import { createContext, useContext } from "react";

/**
 * Where Radix portals (dialogs, sheets, menus, popovers, tooltips) render. The admin shell
 * provides an element inside its themed scope so portalled UI keeps the admin tokens and dark
 * mode; elsewhere portals go to <body> as usual.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
