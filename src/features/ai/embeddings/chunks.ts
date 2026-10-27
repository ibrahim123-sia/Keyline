import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import type { EmbeddingEntityType } from "@/db/schema/ai";
import type { StoredSection } from "@/db/schema/cms";
import { pages } from "@/db/schema/cms";
import { areaGuides, faqs, posts } from "@/db/schema/content";
import {
  developers,
  facilities,
  locations,
  pois,
  poiTypes,
  propertyTypes,
} from "@/db/schema/master-data";
import { projectFacilities, projectPois, projects, projectUnitTypes } from "@/db/schema/projects";
import { properties, propertyFacilities, propertyPois } from "@/db/schema/properties";
import { liveStatuses } from "@/features/properties/status";
import { richTextToPlain } from "@/lib/rich-text";

/**
 * The text that is embedded for each public entity (10 §1): title + key facts + description
 * + facilities + nearby places. Prices are left out on purpose: they are only ever read live
 * from the listing (grounding rule), never from search text.
 */

export type EntityDocument = {
  /** False when the entity is not public (draft, unpublished, deleted): its chunks go. */
  visible: boolean;
  title: string;
  chunks: string[];
};

const HIDDEN: EntityDocument = { visible: false, title: "", chunks: [] };

/** Chunks of at most `max` characters, split at paragraphs, then sentences, then words. */
export function splitText(text: string, max = 1200): string[] {
  const pieces: string[] = [];
  const paragraphs = text
    .split(/\n{1,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let current = "";
  const push = () => {
    if (current.trim()) pieces.push(current.trim());
    current = "";
  };
  for (const paragraph of paragraphs) {
    const units =
      paragraph.length <= max ? [paragraph] : (paragraph.match(/[^.!?]+[.!?]*\s*/g) ?? []);
    for (let unit of units) {
      while (unit.length > max) {
        const cut = unit.lastIndexOf(" ", max) > max / 2 ? unit.lastIndexOf(" ", max) : max;
        push();
        pieces.push(unit.slice(0, cut).trim());
        unit = unit.slice(cut);
      }
      if (current.length + unit.length + 1 > max) push();
      current += (current ? (units.length > 1 ? "" : "\n") : "") + unit;
    }
  }
  push();
  return pieces;
}

/**
 * Chunk 0 is the header (title and facts) with the start of the body; later chunks repeat the
 * title so each one makes sense on its own.
 */
export function buildChunks(title: string, facts: string[], body: string, max = 1200): string[] {
  const header = [title, ...facts.filter(Boolean)].join("\n");
  const rest = splitText(body, max);
  if (rest.length === 0) return [header];
  const first = rest[0]!;
  const chunks =
    header.length + first.length + 1 <= max * 1.5
      ? [`${header}\n${first}`, ...rest.slice(1)]
      : [header, ...rest];
  return chunks.map((c, i) => (i === 0 ? c : `${title}\n${c}`));
}

const list = (label: string, items: string[]) =>
  items.length ? `${label}: ${[...new Set(items)].join(", ")}.` : "";

const km = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

async function locationName(db: DbOrTx, id: string | null): Promise<string> {
  if (!id) return "";
  const rows = await db.execute<{ name: string }>(sql`
    with recursive up as (
      select id, parent_id, name, 0 as depth from ${locations} where id = ${id}
      union all
      select l.id, l.parent_id, l.name, up.depth + 1 from ${locations} l join up on l.id = up.parent_id
    ) select name from up order by depth`);
  return rows.rows.map((r) => r.name).join(", ");
}

async function propertyDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [p] = await db
    .select({
      title: properties.title,
      reference: properties.reference,
      purpose: properties.purpose,
      status: properties.status,
      completion: properties.completion,
      publishedAt: properties.publishedAt,
      deletedAt: properties.deletedAt,
      noindex: properties.noindex,
      typeName: propertyTypes.name,
      locationId: properties.locationId,
      buildingName: properties.buildingName,
      beds: properties.beds,
      baths: properties.baths,
      size: properties.size,
      furnishing: properties.furnishing,
      view: properties.view,
      handoverText: properties.handoverText,
      handoverDate: properties.handoverDate,
      highlights: properties.highlights,
      description: properties.description,
      projectName: projects.name,
      developerName: developers.name,
      maidRoom: properties.maidRoom,
      study: properties.study,
    })
    .from(properties)
    .leftJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(projects, eq(projects.id, properties.projectId))
    .leftJoin(developers, eq(developers.id, projects.developerId))
    .where(and(eq(properties.id, id), eq(properties.agencyId, currentAgencyId())))
    .limit(1);
  if (
    !p ||
    p.deletedAt ||
    !p.publishedAt ||
    p.noindex ||
    !(liveStatuses as readonly string[]).includes(p.status)
  )
    return HIDDEN;

  const [facilityRows, poiRows, place] = await Promise.all([
    db
      .select({ name: facilities.name })
      .from(propertyFacilities)
      .innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId))
      .where(eq(propertyFacilities.propertyId, id))
      .orderBy(asc(facilities.sortOrder)),
    db
      .select({
        name: pois.name,
        type: poiTypes.name,
        metres: propertyPois.straightDistanceM,
        overrideText: propertyPois.overrideText,
      })
      .from(propertyPois)
      .innerJoin(pois, eq(pois.id, propertyPois.poiId))
      .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
      .where(and(eq(propertyPois.propertyId, id), eq(propertyPois.isShown, true)))
      .orderBy(asc(propertyPois.sortOrder), asc(propertyPois.straightDistanceM))
      .limit(12),
    locationName(db, p.locationId),
  ]);

  const purpose = p.purpose === "rent" ? "For rent" : "For sale";
  const what = [p.typeName ?? "Property", place ? `in ${place}` : ""].filter(Boolean).join(" ");
  const rooms = [
    p.beds === 0 ? "Studio" : p.beds != null ? `${p.beds} bedrooms` : "",
    p.baths != null ? `${p.baths} bathrooms` : "",
    p.size != null ? `${Math.round(p.size)} m²` : "",
    p.maidRoom ? "maid's room" : "",
    p.study ? "study" : "",
  ].filter(Boolean);
  const facts = [
    `Reference ${p.reference}. ${purpose}. ${what}.`,
    p.buildingName ? `Building: ${p.buildingName}.` : "",
    rooms.length ? `${rooms.join(", ")}.` : "",
    p.completion === "off_plan"
      ? `Off-plan${p.handoverText || p.handoverDate ? `, handover ${p.handoverText ?? p.handoverDate}` : ""}.`
      : "Ready to move in.",
    p.furnishing ? `Furnishing: ${p.furnishing}.` : "",
    list("View", p.view),
    p.projectName
      ? `Project: ${p.projectName}${p.developerName ? ` by ${p.developerName}` : ""}.`
      : "",
    list("Highlights", p.highlights),
    list(
      "Facilities",
      facilityRows.map((f) => f.name),
    ),
    list(
      "Nearby",
      poiRows.map((r) => `${r.name} (${r.type}, ${r.overrideText ?? km(r.metres)})`),
    ),
  ];
  return {
    visible: true,
    title: p.title,
    chunks: buildChunks(p.title, facts, richTextToPlain(p.description)),
  };
}

async function projectDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [p] = await db
    .select({
      name: projects.name,
      status: projects.status,
      isPublished: projects.isPublished,
      deletedAt: projects.deletedAt,
      noindex: projects.noindex,
      locationId: projects.locationId,
      handoverText: projects.handoverText,
      handoverDate: projects.handoverDate,
      unitTypesSummary: projects.unitTypesSummary,
      totalUnits: projects.totalUnits,
      highlights: projects.highlights,
      description: projects.description,
      developerName: developers.name,
    })
    .from(projects)
    .leftJoin(developers, eq(developers.id, projects.developerId))
    .where(and(eq(projects.id, id), eq(projects.agencyId, currentAgencyId())))
    .limit(1);
  if (!p || p.deletedAt || !p.isPublished || p.noindex) return HIDDEN;
  const [facilityRows, unitRows, poiRows, place] = await Promise.all([
    db
      .select({ name: facilities.name })
      .from(projectFacilities)
      .innerJoin(facilities, eq(facilities.id, projectFacilities.facilityId))
      .where(eq(projectFacilities.projectId, id)),
    db
      .select({ name: projectUnitTypes.name, beds: projectUnitTypes.beds })
      .from(projectUnitTypes)
      .where(eq(projectUnitTypes.projectId, id))
      .orderBy(asc(projectUnitTypes.sortOrder)),
    db
      .select({
        name: pois.name,
        type: poiTypes.name,
        metres: projectPois.straightDistanceM,
        overrideText: projectPois.overrideText,
      })
      .from(projectPois)
      .innerJoin(pois, eq(pois.id, projectPois.poiId))
      .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
      .where(and(eq(projectPois.projectId, id), eq(projectPois.isShown, true)))
      .orderBy(asc(projectPois.sortOrder))
      .limit(12),
    locationName(db, p.locationId),
  ]);
  const facts = [
    `Project${place ? ` in ${place}` : ""}${p.developerName ? ` by ${p.developerName}` : ""}. Status: ${p.status.replace(/_/g, " ")}.`,
    p.handoverText || p.handoverDate ? `Handover ${p.handoverText ?? p.handoverDate}.` : "",
    p.totalUnits ? `${p.totalUnits} units.` : "",
    p.unitTypesSummary ? `Unit types: ${p.unitTypesSummary}.` : "",
    list(
      "Unit types",
      unitRows.map((u) => (u.beds != null ? `${u.name} (${u.beds} bedrooms)` : u.name)),
    ),
    list("Highlights", p.highlights),
    list(
      "Facilities",
      facilityRows.map((f) => f.name),
    ),
    list(
      "Nearby",
      poiRows.map((r) => `${r.name} (${r.type}, ${r.overrideText ?? km(r.metres)})`),
    ),
  ];
  return {
    visible: true,
    title: p.name,
    chunks: buildChunks(p.name, facts, richTextToPlain(p.description)),
  };
}

async function developerDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [d] = await db
    .select({
      name: developers.name,
      description: developers.description,
      website: developers.website,
      year: developers.establishedYear,
      deletedAt: developers.deletedAt,
      noindex: developers.noindex,
    })
    .from(developers)
    .where(and(eq(developers.id, id), eq(developers.agencyId, currentAgencyId())))
    .limit(1);
  if (!d || d.deletedAt || d.noindex) return HIDDEN;
  const projectNames = await db
    .select({ name: projects.name })
    .from(projects)
    .where(
      and(eq(projects.developerId, id), eq(projects.isPublished, true), isNull(projects.deletedAt)),
    );
  const facts = [
    `Developer.${d.year ? ` Established ${d.year}.` : ""}`,
    list(
      "Projects",
      projectNames.map((p) => p.name),
    ),
  ];
  return { visible: true, title: d.name, chunks: buildChunks(d.name, facts, d.description ?? "") };
}

async function areaGuideDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [g] = await db
    .select({
      title: areaGuides.title,
      status: areaGuides.status,
      deletedAt: areaGuides.deletedAt,
      noindex: areaGuides.noindex,
      locationId: areaGuides.locationId,
      intro: areaGuides.intro,
      highlights: areaGuides.highlights,
      body: areaGuides.body,
    })
    .from(areaGuides)
    .where(and(eq(areaGuides.id, id), eq(areaGuides.agencyId, currentAgencyId())))
    .limit(1);
  if (!g || g.deletedAt || g.status !== "published" || g.noindex) return HIDDEN;
  const place = await locationName(db, g.locationId);
  const facts = [`Area guide${place ? `: ${place}` : ""}.`, list("Highlights", g.highlights)];
  const body = [g.intro ?? "", richTextToPlain(g.body)].filter(Boolean).join("\n");
  return { visible: true, title: g.title, chunks: buildChunks(g.title, facts, body) };
}

async function postDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [p] = await db
    .select({
      title: posts.title,
      status: posts.status,
      deletedAt: posts.deletedAt,
      noindex: posts.noindex,
      excerpt: posts.excerpt,
      body: posts.body,
    })
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.agencyId, currentAgencyId())))
    .limit(1);
  if (!p || p.deletedAt || p.status !== "published" || p.noindex) return HIDDEN;
  const body = [p.excerpt ?? "", richTextToPlain(p.body)].filter(Boolean).join("\n");
  return { visible: true, title: p.title, chunks: buildChunks(p.title, ["Blog post."], body) };
}

const SECTION_TEXT_KEYS = new Set([
  "title",
  "heading",
  "subheading",
  "eyebrow",
  "text",
  "body",
  "intro",
  "description",
  "quote",
  "question",
  "answer",
  "label",
  "caption",
  "content",
]);

/** Visible words of page-builder sections (headings, text, rich text), not ids or styles. */
export function sectionText(sections: StoredSection[]): string {
  const out: string[] = [];
  const walk = (value: unknown, key: string | null) => {
    if (typeof value === "string") {
      if (key && SECTION_TEXT_KEYS.has(key) && value.trim().length > 1 && !/^https?:/.test(value))
        out.push(value.trim());
    } else if (Array.isArray(value)) value.forEach((v) => walk(v, key));
    else if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj.type === "doc") {
        const plain = richTextToPlain(obj as { type: "doc"; content?: unknown[] });
        if (plain) out.push(plain);
        return;
      }
      for (const [k, v] of Object.entries(obj)) walk(v, k);
    }
  };
  for (const s of sections) if (!s.hidden) walk(s.props, null);
  return out.join("\n");
}

async function pageDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [p] = await db
    .select({
      title: pages.title,
      status: pages.status,
      deletedAt: pages.deletedAt,
      noindex: pages.noindex,
      sections: pages.sections,
    })
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.agencyId, currentAgencyId())))
    .limit(1);
  if (!p || p.deletedAt || p.status !== "published" || p.noindex) return HIDDEN;
  return {
    visible: true,
    title: p.title,
    chunks: buildChunks(p.title, [], sectionText(p.sections)),
  };
}

async function faqDoc(db: DbOrTx, id: string): Promise<EntityDocument> {
  const [f] = await db
    .select({ question: faqs.question, answer: faqs.answer, isPublished: faqs.isPublished })
    .from(faqs)
    .where(and(eq(faqs.id, id), eq(faqs.agencyId, currentAgencyId())))
    .limit(1);
  if (!f || !f.isPublished) return HIDDEN;
  return {
    visible: true,
    title: f.question,
    chunks: buildChunks(f.question, ["Frequently asked question."], richTextToPlain(f.answer)),
  };
}

export async function loadEntityDocument(
  db: DbOrTx,
  type: EmbeddingEntityType,
  id: string,
): Promise<EntityDocument> {
  switch (type) {
    case "property":
      return propertyDoc(db, id);
    case "project":
      return projectDoc(db, id);
    case "developer":
      return developerDoc(db, id);
    case "area_guide":
      return areaGuideDoc(db, id);
    case "post":
      return postDoc(db, id);
    case "page":
      return pageDoc(db, id);
    case "faq":
      return faqDoc(db, id);
  }
}

/** Ids of everything that should be indexed now (the backfill and the nightly check). */
export async function publicEntityIds(
  db: DbOrTx,
): Promise<Array<{ type: EmbeddingEntityType; id: string }>> {
  const agency = currentAgencyId();
  const rows = await db.execute<{ type: EmbeddingEntityType; id: string }>(sql`
    select 'property' as type, id from ${properties}
      where agency_id = ${agency} and deleted_at is null and published_at is not null
        and status in ${[...liveStatuses]} and noindex = false
    union all select 'project', id from ${projects}
      where agency_id = ${agency} and deleted_at is null and is_published and noindex = false
    union all select 'developer', id from ${developers}
      where agency_id = ${agency} and deleted_at is null and noindex = false
    union all select 'area_guide', id from ${areaGuides}
      where agency_id = ${agency} and deleted_at is null and status = 'published' and noindex = false
    union all select 'post', id from ${posts}
      where agency_id = ${agency} and deleted_at is null and status = 'published' and noindex = false
    union all select 'page', id from ${pages}
      where agency_id = ${agency} and deleted_at is null and status = 'published' and noindex = false
    union all select 'faq', id from ${faqs}
      where agency_id = ${agency} and is_published`);
  return rows.rows;
}
