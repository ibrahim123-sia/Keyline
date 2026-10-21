import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { currentAgencyId } from "../schema/_common";
import { pages } from "../schema/cms";
import { postCategories } from "../schema/content";
import { locations } from "../schema/master-data";
import { projects } from "../schema/projects";
import { writeMenu } from "@/features/menus/mutations";
import {
  menuInputSchema,
  menuLocations,
  type MenuItemInput,
  type MenuLinkType,
  type MenuLocation,
} from "@/features/menus/schema";
import type { SeedMenuLink, SeedPreset } from "./types";

const system = { type: "system" as const, id: null };

type Lookup = Record<"page" | "area" | "project" | "category", Map<string, string>>;

/** Slugs a preset's menus point at, so they can be looked up in one go. */
function slugsOf(links: SeedMenuLink[], into: Record<keyof Lookup, Set<string>>) {
  for (const l of links) {
    if ("page" in l) into.page.add(l.page);
    if ("area" in l) into.area.add(l.area);
    if ("project" in l) into.project.add(l.project);
    if ("category" in l) into.category.add(l.category);
    slugsOf(l.children ?? [], into);
  }
}

async function lookup(db: Db, preset: SeedPreset): Promise<Lookup> {
  const want = {
    page: new Set<string>(),
    area: new Set<string>(),
    project: new Set<string>(),
    category: new Set<string>(),
  };
  for (const menu of Object.values(preset.menus ?? {})) slugsOf(menu?.links ?? [], want);
  const agency = currentAgencyId();
  const map = (rows: Array<{ id: string; slug: string }>) =>
    new Map(rows.map((r) => [r.slug, r.id]));
  const list = (s: Set<string>) => [...s];
  return {
    page: want.page.size
      ? map(
          await db
            .select({ id: pages.id, slug: pages.slug })
            .from(pages)
            .where(
              and(
                eq(pages.agencyId, agency),
                inArray(pages.slug, list(want.page)),
                isNull(pages.deletedAt),
              ),
            ),
        )
      : new Map(),
    area: want.area.size
      ? map(
          await db
            .select({ id: locations.id, slug: locations.slug })
            .from(locations)
            .where(and(eq(locations.agencyId, agency), inArray(locations.slug, list(want.area)))),
        )
      : new Map(),
    project: want.project.size
      ? map(
          await db
            .select({ id: projects.id, slug: projects.slug })
            .from(projects)
            .where(and(eq(projects.agencyId, agency), inArray(projects.slug, list(want.project)))),
        )
      : new Map(),
    category: want.category.size
      ? map(
          await db
            .select({ id: postCategories.id, slug: postCategories.slug })
            .from(postCategories)
            .where(
              and(
                eq(postCategories.agencyId, agency),
                inArray(postCategories.slug, list(want.category)),
              ),
            ),
        )
      : new Map(),
  };
}

let counter = 0;
const nextId = (location: MenuLocation) => `${location}-${++counter}`;

/** A preset link as a stored menu item; null when what it points at was not seeded. */
function toItem(l: SeedMenuLink, found: Lookup, location: MenuLocation): MenuItemInput | null {
  let type: MenuLinkType;
  let target: string | undefined;
  if ("search" in l) [type, target] = ["search", l.search];
  else if ("url" in l) [type, target] = ["url", l.url];
  else if ("page" in l) [type, target] = ["page", found.page.get(l.page)];
  else if ("area" in l) [type, target] = ["area", found.area.get(l.area)];
  else if ("project" in l) [type, target] = ["project", found.project.get(l.project)];
  else [type, target] = ["category", found.category.get(l.category)];
  if (!target) return null;
  return {
    id: nextId(location),
    label: l.label,
    type,
    target,
    openInNewTab: l.newTab ?? false,
    children: (l.children ?? [])
      .map((c) => toItem(c, found, location))
      .filter((c): c is MenuItemInput => c !== null)
      .map(({ children: _c, ...child }) => child),
  };
}

/**
 * Header, phone and footer menus from the preset (16 §1 "header and footer menus"). Links
 * point at seeded pages, areas, projects and categories by slug; a link whose target was not
 * seeded (a page the preset does not have) is left out. Returns the number of links.
 */
export async function seedMenus(db: Db, preset: SeedPreset): Promise<number> {
  if (!preset.menus) return 0;
  counter = 0;
  const found = await lookup(db, preset);
  let links = 0;
  for (const location of menuLocations) {
    const menu = preset.menus[location];
    if (!menu) continue;
    const items = menu.links
      .map((l) => toItem(l, found, location))
      .filter((i): i is MenuItemInput => i !== null);
    const data = menuInputSchema.parse({ location, title: menu.title ?? "", items });
    await db.transaction((tx) => writeMenu(tx, data, system));
    links += data.items.reduce((n, i) => n + 1 + i.children.length, 0);
  }
  return links;
}
