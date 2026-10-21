import { z } from "zod";
import { menuLocations } from "@/db/schema/content";

/**
 * Site menus (08 §2): header (with one level of dropdowns), phone menu and three footer
 * columns. An item points at a page, a web address, a search preset, an area, a project or a
 * blog category; links are worked out when the site renders, so a renamed page or project
 * never breaks a menu.
 */

export type MenuLocation = (typeof menuLocations)[number];
export { menuLocations };

export const menuLinkTypes = ["page", "url", "search", "area", "project", "category"] as const;
export type MenuLinkType = (typeof menuLinkTypes)[number];

export const menuLocationLabels: Record<MenuLocation, string> = {
  header: "Header",
  mobile: "Phone menu",
  footer_1: "Footer column 1",
  footer_2: "Footer column 2",
  footer_3: "Footer column 3",
};

export const menuLinkLabels: Record<MenuLinkType, string> = {
  page: "Page",
  url: "Web address",
  search: "Search preset",
  area: "Area",
  project: "Project",
  category: "Blog category",
};

/** Header and phone menus may have one level of dropdown links; footer columns are flat. */
export const allowsChildren = (location: MenuLocation) => !location.startsWith("footer");

export const MAX_MENU_ITEMS = 20;
export const MAX_MENU_CHILDREN = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Search presets are search addresses: /buy, /rent or /off-plan, an area, a type, filters. */
const SEARCH = /^\/(buy|rent|off-plan)(\/[a-z0-9-]+){0,2}\/?(\?[^\s<>"'`]*)?$/;
/** A path on this site, a full http(s) address, or mailto:/tel: (never javascript: or data:). */
const URL_OR_PATH =
  /^(\/(?!\/)[^\s<>"'`]*|https?:\/\/[^\s<>"'`]+|mailto:[^\s<>"'`]+|tel:\+?[0-9 ()-]{3,30})$/i;

export function targetProblem(type: MenuLinkType, target: string): string | null {
  if (type === "url")
    return URL_OR_PATH.test(target)
      ? null
      : "Use a path like /about, a full https:// address, mailto: or tel:";
  if (type === "search")
    return SEARCH.test(target)
      ? null
      : "Use a search address like /rent?beds=2 or /buy/old-harbour (copy it from the site)";
  return UUID.test(target) ? null : `Choose a ${menuLinkLabels[type].toLowerCase()}`;
}

function checkTarget(item: { type: MenuLinkType; target: string }, ctx: z.RefinementCtx) {
  const problem = targetProblem(item.type, item.target);
  if (problem) ctx.addIssue({ code: "custom", path: ["target"], message: problem });
}

const itemFields = {
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1, "Give the link a label").max(60, "Use at most 60 characters"),
  type: z.enum(menuLinkTypes),
  target: z.string().trim().max(500, "Use at most 500 characters"),
  openInNewTab: z.boolean().default(false),
};

export const menuChildSchema = z.object(itemFields).strict().superRefine(checkTarget);

export const menuItemSchema = z
  .object({
    ...itemFields,
    children: z
      .array(menuChildSchema)
      .max(MAX_MENU_CHILDREN, `Use at most ${MAX_MENU_CHILDREN} links in a dropdown`)
      .default([]),
  })
  .strict()
  .superRefine(checkTarget);

export type MenuChildInput = z.input<typeof menuChildSchema>;
export type MenuChildData = z.output<typeof menuChildSchema>;
export type MenuItemInput = z.input<typeof menuItemSchema>;
export type MenuItemData = z.output<typeof menuItemSchema>;

export const menuInputSchema = z
  .object({
    location: z.enum(menuLocations),
    /** Column heading (footer menus). */
    title: z.string().trim().max(60, "Use at most 60 characters").default(""),
    items: z
      .array(menuItemSchema)
      .max(MAX_MENU_ITEMS, `Use at most ${MAX_MENU_ITEMS} links; move some into dropdowns`),
  })
  .strict()
  .superRefine((menu, ctx) => {
    const seen = new Set<string>();
    menu.items.forEach((item, i) => {
      if (!allowsChildren(menu.location) && item.children.length > 0)
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "children"],
          message: "Footer columns are a single list: move these links up a level.",
        });
      for (const id of [item.id, ...item.children.map((c) => c.id)]) {
        if (seen.has(id))
          ctx.addIssue({ code: "custom", path: ["items", i, "id"], message: "Duplicate link" });
        seen.add(id);
      }
    });
  });

export type MenuInput = z.input<typeof menuInputSchema>;
export type MenuData = z.output<typeof menuInputSchema>;

/**
 * Stored items, read leniently: an entry that no longer validates (manual edit, older shape)
 * is left out instead of breaking the header of every page.
 */
export function parseStoredItems(raw: unknown, location: MenuLocation): MenuItemData[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItemData[] = [];
  for (const entry of raw) {
    const res = menuItemSchema.safeParse(entry);
    if (!res.success) continue;
    out.push(allowsChildren(location) ? res.data : { ...res.data, children: [] });
  }
  return out;
}

/** A menu link as the site renders it. */
export type SiteLink = { label: string; href: string; newTab: boolean; children: SiteLink[] };
export type SiteMenu = { title: string; links: SiteLink[] };
export type SiteMenus = Record<MenuLocation, SiteMenu>;
