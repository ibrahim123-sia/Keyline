import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { areaGuides, postCategories, posts } from "@/db/schema/content";
import { developers, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { jobRuns } from "@/db/schema/system";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { richTextToPlain, wordCount, type RichDoc } from "@/lib/rich-text";
import { CRAWL_JOB } from "./crawl-job";
import type { CrawlResult } from "./crawl";
import { currencyDecimals } from "./entity-seo";
import { placeOf as placeFrom } from "./places";
import { landingCounts } from "./sitemap";
import { areaGuideSeoTitle, listingSeoTitle, postSeoTitle, projectSeoTitle } from "./titles";

export type ReportItem = {
  kind: "listing" | "project" | "page" | "post" | "guide" | "developer" | "agent" | "landing";
  name: string;
  /** Public address. */
  path: string;
  /** Where to fix it in the admin. */
  edit: string;
  detail?: string;
};

export type SeoReport = {
  missingTitles: ReportItem[];
  missingDescriptions: ReportItem[];
  duplicateTitles: Array<{ title: string; items: ReportItem[] }>;
  missingAlts: ReportItem[];
  fewPhotos: ReportItem[];
  thinPages: ReportItem[];
  crawl: {
    result: CrawlResult | null;
    finishedAt: string | null;
    /** A check is queued or running now. */
    pending: boolean;
  };
};

/** Listings need at least this many photos (08 §6 report). */
export const MIN_PHOTOS = 5;
/** Posts and area guides below this many words count as thin. */
export const THIN_WORDS = 300;

const edits = {
  listing: (id: string) => `/admin/properties/${id}`,
  project: (id: string) => `/admin/projects/${id}`,
  page: (id: string) => `/admin/website/pages/${id}`,
  post: (id: string) => `/admin/website/blog/${id}`,
  guide: (id: string) => `/admin/website/area-guides/${id}`,
  developer: () => "/admin/setup/developers",
  agent: () => "/admin/setup/agents",
  landing: () => "/admin/setup/locations",
};

/** Words in a page's sections: every text value except ids, links, media and styles. */
function sectionWords(value: unknown, key = ""): number {
  if (typeof value === "string")
    return /^(id|type|href|url|link|target|image|imageId|mediaId|icon|style|color|variant)$/i.test(
      key,
    )
      ? 0
      : value.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + sectionWords(v, key), 0);
  if (value && typeof value === "object")
    return Object.entries(value).reduce<number>((n, [k, v]) => n + sectionWords(v, k), 0);
  return 0;
}

/** The SEO report (08 §6): what to fix for search engines, from the data and the last crawl. */
export async function buildSeoReport(db: DbOrTx): Promise<SeoReport> {
  const agency = currentAgencyId();
  const seo = await loadSettings("seo", db);
  const general = await loadSettings("general", db);
  const market = await loadSettings("market", db);
  const agencyName = general.agencyName;

  const locs = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      level: locations.level,
      parentId: locations.parentId,
    })
    .from(locations)
    .where(eq(locations.agencyId, agency));
  const locById = new Map(locs.map((l) => [l.id, l]));
  const placeOf = (id: string | null) => placeFrom(locs, id);

  const titled: Array<{ title: string; item: ReportItem }> = [];
  const missingTitles: ReportItem[] = [];
  const missingDescriptions: ReportItem[] = [];
  const missingAlts: ReportItem[] = [];
  const fewPhotos: ReportItem[] = [];
  const thinPages: ReportItem[] = [];

  // Listings: live and indexable.
  const types = new Map(
    (
      await db
        .select({ id: propertyTypes.id, name: propertyTypes.name })
        .from(propertyTypes)
        .where(eq(propertyTypes.agencyId, agency))
    ).map((t) => [t.id, t.name]),
  );
  const listingRows = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      title: properties.title,
      seoTitle: properties.seoTitle,
      seoDescription: properties.seoDescription,
      description: properties.description,
      beds: properties.beds,
      purpose: properties.purpose,
      typeId: properties.propertyTypeId,
      locationId: properties.locationId,
      price: properties.price,
      currency: properties.currency,
      reference: properties.reference,
      photos: sql<number>`(select count(*)::int from property_media pm where pm.property_id = properties.id and pm.kind = 'photo')`,
      noAlt: sql<number>`(select count(*)::int from property_media pm join media m on m.id = pm.media_id
        where pm.property_id = properties.id and pm.kind = 'photo'
          and coalesce(nullif(trim(pm.alt), ''), nullif(trim(m.alt), '')) is null)`,
    })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, agency),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
        eq(properties.noindex, false),
      ),
    );
  for (const l of listingRows) {
    const item: ReportItem = {
      kind: "listing",
      name: `${l.reference} · ${l.title}`,
      path: `/property/${l.slug}`,
      edit: edits.listing(l.id),
    };
    const place = placeOf(l.locationId);
    titled.push({
      title:
        l.seoTitle ||
        listingSeoTitle(seo.listingTitlePattern, {
          title: l.title,
          beds: l.beds,
          purpose: l.purpose,
          typeName: l.typeId ? (types.get(l.typeId) ?? null) : null,
          area: place.area,
          city: place.city,
          price: l.price,
          currency: l.currency ?? market.baseCurrency.code,
          decimals: currencyDecimals(market, l.currency ?? market.baseCurrency.code),
          reference: l.reference,
          agency: agencyName,
        }),
      item,
    });
    if (!l.seoDescription && !richTextToPlain(l.description as RichDoc | null).trim())
      missingDescriptions.push(item);
    if (Number(l.photos) < MIN_PHOTOS)
      fewPhotos.push({ ...item, detail: `${l.photos} of ${MIN_PHOTOS} photos` });
    if (Number(l.noAlt) > 0)
      missingAlts.push({ ...item, detail: `${l.noAlt} photo${Number(l.noAlt) === 1 ? "" : "s"}` });
  }

  // Projects.
  const projectRows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      seoTitle: projects.seoTitle,
      seoDescription: projects.seoDescription,
      descriptionHtml: projects.descriptionHtml,
      locationId: projects.locationId,
      developer: developers.name,
      noAlt: sql<number>`(select count(*)::int from project_media pm join media m on m.id = pm.media_id
        where pm.project_id = projects.id and pm.kind = 'photo'
          and coalesce(nullif(trim(pm.alt), ''), nullif(trim(m.alt), '')) is null)`,
    })
    .from(projects)
    .leftJoin(developers, eq(developers.id, projects.developerId))
    .where(
      and(
        eq(projects.agencyId, agency),
        eq(projects.isPublished, true),
        isNull(projects.deletedAt),
        eq(projects.noindex, false),
      ),
    );
  for (const p of projectRows) {
    const item: ReportItem = {
      kind: "project",
      name: p.name,
      path: `/projects/${p.slug}`,
      edit: edits.project(p.id),
    };
    titled.push({
      title:
        p.seoTitle ||
        projectSeoTitle(seo.projectTitlePattern, {
          name: p.name,
          developer: p.developer,
          area: placeOf(p.locationId).area,
          agency: agencyName,
        }),
      item,
    });
    if (!p.seoDescription && !p.descriptionHtml?.replace(/<[^>]+>/g, "").trim())
      missingDescriptions.push(item);
    if (Number(p.noAlt) > 0)
      missingAlts.push({ ...item, detail: `${p.noAlt} photo${Number(p.noAlt) === 1 ? "" : "s"}` });
  }

  // Pages from the page builder.
  const pageRows = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      title: pages.title,
      isHome: pages.isHome,
      seoTitle: pages.seoTitle,
      seoDescription: pages.seoDescription,
      sections: pages.sections,
    })
    .from(pages)
    .where(
      and(
        eq(pages.agencyId, agency),
        eq(pages.status, "published"),
        isNull(pages.deletedAt),
        eq(pages.noindex, false),
      ),
    );
  for (const p of pageRows) {
    const item: ReportItem = {
      kind: "page",
      name: p.title,
      path: p.isHome ? "/" : `/${p.slug}`,
      edit: edits.page(p.id),
    };
    if (!p.seoTitle) missingTitles.push(item);
    if (!p.seoDescription) missingDescriptions.push(item);
    titled.push({ title: p.seoTitle || p.title, item });
    const words = sectionWords(p.sections);
    if (!p.isHome && words < THIN_WORDS / 2) thinPages.push({ ...item, detail: `${words} words` });
  }

  // Blog posts.
  const cats = new Map(
    (
      await db
        .select({ id: postCategories.id, name: postCategories.name })
        .from(postCategories)
        .where(eq(postCategories.agencyId, agency))
    ).map((c) => [c.id, c.name]),
  );
  const postRows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      seoTitle: posts.seoTitle,
      seoDescription: posts.seoDescription,
      excerpt: posts.excerpt,
      body: posts.body,
      categoryId: posts.categoryId,
    })
    .from(posts)
    .where(
      and(
        eq(posts.agencyId, agency),
        eq(posts.status, "published"),
        isNull(posts.deletedAt),
        eq(posts.noindex, false),
      ),
    );
  for (const p of postRows) {
    const item: ReportItem = {
      kind: "post",
      name: p.title,
      path: `/insights/${p.slug}`,
      edit: edits.post(p.id),
    };
    titled.push({
      title:
        p.seoTitle ||
        postSeoTitle(seo.postTitlePattern, {
          title: p.title,
          category: p.categoryId ? (cats.get(p.categoryId) ?? null) : null,
          agency: agencyName,
        }),
      item,
    });
    if (!p.seoDescription && !p.excerpt?.trim()) missingDescriptions.push(item);
    const words = wordCount(p.body);
    if (words < THIN_WORDS) thinPages.push({ ...item, detail: `${words} words` });
  }

  // Area guides.
  const guideRows = await db
    .select({
      id: areaGuides.id,
      slug: areaGuides.slug,
      title: areaGuides.title,
      seoTitle: areaGuides.seoTitle,
      seoDescription: areaGuides.seoDescription,
      intro: areaGuides.intro,
      body: areaGuides.body,
      locationId: areaGuides.locationId,
    })
    .from(areaGuides)
    .where(
      and(
        eq(areaGuides.agencyId, agency),
        eq(areaGuides.status, "published"),
        isNull(areaGuides.deletedAt),
        eq(areaGuides.noindex, false),
      ),
    );
  for (const g of guideRows) {
    const item: ReportItem = {
      kind: "guide",
      name: g.title,
      path: `/areas/${g.slug}`,
      edit: edits.guide(g.id),
    };
    const place = placeOf(g.locationId);
    titled.push({
      title:
        g.seoTitle ||
        areaGuideSeoTitle(seo.areaTitlePattern, {
          title: g.title,
          area: locById.get(g.locationId)?.name ?? g.title,
          city: place.city,
          agency: agencyName,
        }),
      item,
    });
    if (!g.seoDescription && !g.intro?.trim()) missingDescriptions.push(item);
    const words = wordCount(g.body);
    if (words < THIN_WORDS) thinPages.push({ ...item, detail: `${words} words` });
  }

  // Developers and agents: their pages use the name and the description or bio.
  for (const d of await db
    .select({
      id: developers.id,
      slug: developers.slug,
      name: developers.name,
      seoTitle: developers.seoTitle,
      seoDescription: developers.seoDescription,
      description: developers.description,
    })
    .from(developers)
    .where(
      and(
        eq(developers.agencyId, agency),
        isNull(developers.deletedAt),
        eq(developers.noindex, false),
      ),
    )) {
    const item: ReportItem = {
      kind: "developer",
      name: d.name,
      path: `/developers/${d.slug}`,
      edit: edits.developer(),
    };
    titled.push({ title: d.seoTitle || d.name, item });
    if (!d.seoDescription && !d.description?.trim()) missingDescriptions.push(item);
  }
  for (const a of await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      seoTitle: agents.seoTitle,
      seoDescription: agents.seoDescription,
      bio: agents.bio,
    })
    .from(agents)
    .where(
      and(eq(agents.agencyId, agency), eq(agents.isActive, true), eq(agents.noindex, false)),
    )) {
    const item: ReportItem = {
      kind: "agent",
      name: a.name,
      path: `/agents/${a.slug}`,
      edit: edits.agent(),
    };
    titled.push({ title: a.seoTitle || a.name, item });
    if (!a.seoDescription && !a.bio?.trim()) missingDescriptions.push(item);
  }

  // Area landings that have homes but too few to be indexed (they get noindex on their own).
  for (const c of await landingCounts(db)) {
    if (!c.locationId || c.typeSlug || c.n >= seo.thinPageMinListings) continue;
    const loc = locById.get(c.locationId);
    if (!loc) continue;
    const root = c.purpose === "rent" ? "/rent" : "/buy";
    thinPages.push({
      kind: "landing",
      name: `${loc.name} (${c.purpose === "rent" ? "to rent" : "for sale"})`,
      path: `${root}/${loc.slug}`,
      edit: edits.landing(),
      detail: `${c.n} of ${seo.thinPageMinListings} listings: not indexed`,
    });
  }

  const groups = new Map<string, ReportItem[]>();
  for (const { title, item } of titled) {
    const key = title.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const duplicateTitles = [...groups]
    .filter(([, items]) => items.length > 1)
    .map(([, items]) => ({
      title: titled.find((t) => t.item === items[0])!.title,
      items,
    }))
    .sort((a, b) => b.items.length - a.items.length);

  const runs = await db
    .select({ status: jobRuns.status, finishedAt: jobRuns.finishedAt, result: jobRuns.result })
    .from(jobRuns)
    .where(
      and(eq(jobRuns.agencyId, agency), inArray(jobRuns.name, [CRAWL_JOB, `cron:${CRAWL_JOB}`])),
    )
    .orderBy(desc(jobRuns.createdAt))
    .limit(10);
  const last = runs.find((r) => r.status === "succeeded" && r.result);
  return {
    missingTitles,
    missingDescriptions,
    duplicateTitles,
    missingAlts,
    fewPhotos,
    thinPages,
    crawl: {
      result: (last?.result as CrawlResult | undefined) ?? null,
      finishedAt: last?.finishedAt?.toISOString() ?? null,
      pending: runs.some((r) => r.status === "queued" || r.status === "running"),
    },
  };
}
