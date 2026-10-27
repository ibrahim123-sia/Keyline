import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { areaGuides, menus, postCategories } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import {
  menuLocations,
  parseStoredItems,
  type MenuChildData,
  type MenuItemData,
  type MenuLinkType,
  type MenuLocation,
  type SiteLink,
  type SiteMenus,
} from "./schema";

export type AdminMenu = {
  location: MenuLocation;
  title: string;
  items: MenuItemData[];
  updatedAt: string | null;
};

/** Every menu location for the editor (empty ones included). */
export async function loadMenus(db: DbOrTx): Promise<Record<MenuLocation, AdminMenu>> {
  const rows = await db.select().from(menus).where(eq(menus.agencyId, currentAgencyId()));
  const byLocation = new Map(rows.map((r) => [r.location, r]));
  return Object.fromEntries(
    menuLocations.map((location) => {
      const row = byLocation.get(location);
      return [
        location,
        {
          location,
          title: row?.title ?? "",
          items: parseStoredItems(row?.items, location),
          updatedAt: row?.updatedAt.toISOString() ?? null,
        },
      ];
    }),
  ) as Record<MenuLocation, AdminMenu>;
}

/** Area links go to places people search in (buildings and countries are left out). */
const areaLevels = ["city", "area", "community"] as const;

export type MenuTargetOptions = {
  pages: Array<{ id: string; title: string; slug: string; live: boolean; isHome: boolean }>;
  areas: Array<{ id: string; parentId: string | null; name: string; level: string }>;
  projects: Array<{ id: string; name: string; slug: string; live: boolean }>;
  categories: Array<{ id: string; name: string; slug: string }>;
};

/** Pick lists for the menu editor: pages, areas, projects and blog categories. */
export async function menuTargetOptions(db: DbOrTx): Promise<MenuTargetOptions> {
  const agency = currentAgencyId();
  const pageRows = await db
    .select({
      id: pages.id,
      title: pages.title,
      slug: pages.slug,
      status: pages.status,
      isHome: pages.isHome,
    })
    .from(pages)
    .where(and(eq(pages.agencyId, agency), isNull(pages.deletedAt)))
    .orderBy(asc(pages.title));
  const areaRows = await db
    .select({
      id: locations.id,
      parentId: locations.parentId,
      name: locations.name,
      level: locations.level,
    })
    .from(locations)
    .where(and(eq(locations.agencyId, agency), inArray(locations.level, areaLevels)))
    .orderBy(asc(locations.name));
  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      live: projects.isPublished,
    })
    .from(projects)
    .where(and(eq(projects.agencyId, agency), isNull(projects.deletedAt)))
    .orderBy(asc(projects.name));
  const categoryRows = await db
    .select({ id: postCategories.id, name: postCategories.name, slug: postCategories.slug })
    .from(postCategories)
    .where(eq(postCategories.agencyId, agency))
    .orderBy(asc(postCategories.sortOrder), asc(postCategories.name));
  return {
    pages: pageRows.map(({ status, ...p }) => ({ ...p, live: status === "published" })),
    areas: areaRows,
    projects: projectRows,
    categories: categoryRows,
  };
}

type Target = { type: MenuLinkType; target: string };
const key = (t: Target) => `${t.type}:${t.target}`;

/**
 * Where each page, area, project and category target lives on the site now. Targets that
 * are gone or not public are missing from the map, so their links are left out.
 * Areas open their area guide when one is published, otherwise the area's homes for sale.
 */
export async function resolveTargets(db: DbOrTx, targets: Target[]): Promise<Map<string, string>> {
  const agency = currentAgencyId();
  const ids = (type: MenuLinkType) => [
    ...new Set(targets.filter((t) => t.type === type).map((t) => t.target)),
  ];
  const out = new Map<string, string>();

  const pageIds = ids("page");
  if (pageIds.length) {
    const rows = await db
      .select({ id: pages.id, slug: pages.slug, isHome: pages.isHome })
      .from(pages)
      .where(
        and(
          eq(pages.agencyId, agency),
          inArray(pages.id, pageIds),
          eq(pages.status, "published"),
          isNull(pages.deletedAt),
        ),
      );
    for (const r of rows) out.set(`page:${r.id}`, r.isHome ? "/" : `/${r.slug}`);
  }

  const projectIds = ids("project");
  if (projectIds.length) {
    const rows = await db
      .select({ id: projects.id, slug: projects.slug })
      .from(projects)
      .where(
        and(
          eq(projects.agencyId, agency),
          inArray(projects.id, projectIds),
          eq(projects.isPublished, true),
          isNull(projects.deletedAt),
        ),
      );
    for (const r of rows) out.set(`project:${r.id}`, `/projects/${r.slug}`);
  }

  const areaIds = ids("area");
  if (areaIds.length) {
    const rows = await db
      .select({ id: locations.id, slug: locations.slug })
      .from(locations)
      .where(and(eq(locations.agencyId, agency), inArray(locations.id, areaIds)));
    const guides = await db
      .select({ locationId: areaGuides.locationId, slug: areaGuides.slug })
      .from(areaGuides)
      .where(
        and(
          eq(areaGuides.agencyId, agency),
          inArray(areaGuides.locationId, areaIds),
          eq(areaGuides.status, "published"),
          isNull(areaGuides.deletedAt),
        ),
      );
    const guideFor = new Map(guides.map((g) => [g.locationId, g.slug]));
    for (const r of rows) {
      const guide = guideFor.get(r.id);
      out.set(`area:${r.id}`, guide ? `/areas/${guide}` : `/buy/${r.slug}`);
    }
  }

  const categoryIds = ids("category");
  if (categoryIds.length) {
    const rows = await db
      .select({ id: postCategories.id, slug: postCategories.slug })
      .from(postCategories)
      .where(and(eq(postCategories.agencyId, agency), inArray(postCategories.id, categoryIds)));
    for (const r of rows) out.set(`category:${r.id}`, `/insights/category/${r.slug}`);
  }
  return out;
}

export function hrefFor(item: Target, resolved: Map<string, string>): string | null {
  if (item.type === "url" || item.type === "search") return item.target;
  return resolved.get(key(item)) ?? null;
}

/** Turns stored items into site links; items whose target is gone are left out. */
export function toSiteLinks(
  items: Array<MenuChildData & { children?: MenuChildData[] }>,
  resolved: Map<string, string>,
): SiteLink[] {
  const links: SiteLink[] = [];
  for (const item of items) {
    const href = hrefFor(item, resolved);
    if (!href) continue;
    links.push({
      label: item.label,
      href,
      newTab: item.openInNewTab,
      children: toSiteLinks(item.children ?? [], resolved),
    });
  }
  return links;
}

/** All menus as the site shows them (uncached; the site reads `getSiteMenus`). */
export async function buildSiteMenus(db: DbOrTx): Promise<SiteMenus> {
  const all = await loadMenus(db);
  const targets = Object.values(all).flatMap((m) => m.items.flatMap((i) => [i, ...i.children]));
  const resolved = await resolveTargets(db, targets);
  return Object.fromEntries(
    menuLocations.map((location) => [
      location,
      { title: all[location].title, links: toSiteLinks(all[location].items, resolved) },
    ]),
  ) as SiteMenus;
}
