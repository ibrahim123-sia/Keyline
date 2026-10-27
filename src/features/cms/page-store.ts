import "server-only";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pageRevisions, pages, type StoredSection } from "@/db/schema/cms";
import { seoRedirects } from "@/db/schema/seo";
import { syncMediaUsage } from "@/features/media/usage";
import { normalizePath } from "@/features/seo/redirects";
import { ActionError, errorsByPath } from "@/lib/actions";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { uniqueSlug } from "@/lib/slug";
import { MAX_DRAFT_BYTES, REVISIONS_KEPT, type PageStarter, type RevisionSeo } from "./page-schema";
import { sectionProblems, stableJson, starterSection } from "./section-rules";

export { stableJson };
import {
  isSectionType,
  parseSection,
  sectionInputSchema,
  sectionMediaIds,
  type Section,
} from "./sections";

/** Page builder writes (08 §1). Not a "use server" module: nothing here is a public endpoint. */

export type PageRow = typeof pages.$inferSelect;

export async function loadPageRow(db: DbOrTx, id: string): Promise<PageRow | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.agencyId, currentAgencyId())));
  return row ?? null;
}

/** The page for a write: it must exist, not be in the trash, and be the version the admin saw. */
export async function pageForWrite(
  db: DbOrTx,
  id: string,
  expectedUpdatedAt: string | null,
): Promise<PageRow> {
  const row = await loadPageRow(db, id);
  if (!row) throw new ActionError("This page no longer exists.", "NOT_FOUND");
  if (row.deletedAt) throw new ActionError("This page is in the trash.", "NOT_FOUND");
  if (expectedUpdatedAt !== null && row.updatedAt.getTime() !== Date.parse(expectedUpdatedAt))
    throw new ActionError(
      "Someone else changed this page since you opened it. Reload to see their changes; yours stay on this page until you do.",
      "CONFLICT",
    );
  return row;
}

/** True once the page has been published at least once (it has a revision). */
export async function hasBeenPublished(db: DbOrTx, pageId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pageRevisions.id })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .limit(1);
  return Boolean(row);
}

/** First free slug for a page; pages in the trash keep theirs until deleted for good. */
export async function pageSlug(db: DbOrTx, base: string, exceptId: string | null) {
  return uniqueSlug(base, async (candidates) => {
    const rows = await db
      .select({ slug: pages.slug })
      .from(pages)
      .where(
        and(
          eq(pages.agencyId, currentAgencyId()),
          inArray(pages.slug, candidates),
          exceptId ? sql`${pages.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

export async function slugTakenBy(
  db: DbOrTx,
  slug: string,
  exceptId: string,
): Promise<PageRow | null> {
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.agencyId, currentAgencyId()),
        eq(pages.slug, slug),
        sql`${pages.id} <> ${exceptId}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** What the editor works on: the draft when there is one, else the published sections. */
export function workingSections(row: Pick<PageRow, "sections" | "draftSections">) {
  return row.draftSections ?? row.sections;
}

export type DraftCheck = {
  sections: StoredSection[];
  /** Section id -> field path -> messages, for sections that are not finished yet. */
  problems: Record<string, Record<string, string[]>>;
};

/**
 * Checks a draft from the editor. Valid sections are stored as parsed (defaults filled in);
 * a section that fails its schema is still kept, so autosave never loses work, but it is
 * reported and the site never shows it (parseSection skips it) until it is fixed.
 */
export function checkDraft(raw: unknown[]): DraftCheck {
  if (JSON.stringify(raw).length > MAX_DRAFT_BYTES)
    throw new ActionError("This page is too long to save. Split it into two pages.", "VALIDATION");
  const schema = sectionInputSchema();
  const seen = new Set<string>();
  const sections: StoredSection[] = [];
  const problems: DraftCheck["problems"] = {};
  raw.forEach((item, index) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id : "";
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seen.has(id))
      throw new ActionError(
        `Section ${index + 1} has a missing or repeated id. Reload the page.`,
        "VALIDATION",
      );
    seen.add(id);
    if (!isSectionType(s.type))
      throw new ActionError(
        `Section ${index + 1} has an unknown type. Reload the page.`,
        "VALIDATION",
      );
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      const stored = parsed.data as unknown as StoredSection;
      sections.push(stored);
      const issues = sectionProblems(parseSection(stored)!);
      if (issues.length) problems[id] = groupProblems(issues);
      return;
    }
    const props = s.props && typeof s.props === "object" && !Array.isArray(s.props) ? s.props : {};
    const style = s.style && typeof s.style === "object" && !Array.isArray(s.style) ? s.style : {};
    sections.push({
      id,
      type: s.type,
      props: props as Record<string, unknown>,
      style: style as Record<string, unknown>,
      ...(s.hidden === true ? { hidden: true } : {}),
    });
    problems[id] = errorsByPath(parsed.error).fieldErrors;
  });
  return { sections, problems };
}

function groupProblems(list: Array<{ field: string; message: string }>) {
  const out: Record<string, string[]> = {};
  for (const p of list) (out[p.field] ??= []).push(p.message);
  return out;
}

/**
 * Publish rules (08 §1): at least one visible section, and every section complete. Returns
 * the sections as the site will store them, or throws with field errors per section.
 */
export function sectionsForPublish(raw: StoredSection[]): Section[] {
  const { sections, problems } = checkDraft(raw);
  const fieldErrors: Record<string, string[]> = {};
  for (const [id, fields] of Object.entries(problems))
    for (const [field, messages] of Object.entries(fields))
      fieldErrors[`sections.${id}.${field}`] = messages;
  const parsed = sections.map((s) => parseSection(s)!);
  if (Object.keys(fieldErrors).length > 0)
    throw new ActionError(
      "Some sections are not finished. Fix the highlighted fields, then publish.",
      "PUBLISH_RULES",
      fieldErrors,
    );
  if (!parsed.some((s) => !s.hidden))
    throw new ActionError("Add at least one section before publishing.", "PUBLISH_RULES");
  return parsed;
}

export function revisionSeo(row: PageRow): RevisionSeo {
  return {
    title: row.title,
    slug: row.slug,
    template: row.template,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogImageId: row.ogImageId,
    canonicalUrl: row.canonicalUrl,
    noindex: row.noindex,
  };
}

/** Media ids used by a page: every section of the live and draft versions, and the share image. */
export function pageMediaIds(
  row: Pick<PageRow, "sections" | "draftSections" | "ogImageId">,
): string[] {
  return [
    ...row.sections.flatMap(sectionMediaIds),
    ...(row.draftSections ?? []).flatMap(sectionMediaIds),
    ...(row.ogImageId ? [row.ogImageId] : []),
  ];
}

/**
 * Publish (08 §1): the draft (or the current sections) becomes what the site shows, a
 * revision is kept (last 20), the version goes up and any schedule is cleared.
 */
export async function publishPageRecord(
  db: DbOrTx,
  row: PageRow,
  args: { actor: AuditActor; userId: string | null; reason?: string },
): Promise<PageRow> {
  const sections = sectionsForPublish(workingSections(row)) as unknown as StoredSection[];
  const [after] = await db
    .update(pages)
    .set({
      sections,
      draftSections: null,
      draftUpdatedAt: null,
      status: "published",
      publishAt: null,
      version: sql`${pages.version} + 1`,
      ...(args.userId ? { updatedBy: args.userId } : {}),
    })
    .where(eq(pages.id, row.id))
    .returning();
  await db.insert(pageRevisions).values({
    pageId: row.id,
    sections,
    seo: revisionSeo(after!),
    createdBy: args.userId,
  });
  await pruneRevisions(db, row.id);
  await writeAudit(db, {
    actor: args.actor,
    action: "page.publish",
    entityType: "page",
    entityId: row.id,
    before: { status: row.status, version: row.version, sections: row.sections.length },
    after: {
      status: "published",
      version: after!.version,
      sections: sections.length,
      ...(args.reason ? { reason: args.reason } : {}),
    },
  });
  await syncMediaUsage(db, [...pageMediaIds(row), ...pageMediaIds(after!)]);
  return after!;
}

/** Keeps the newest revisions of a page and deletes older ones. */
export async function pruneRevisions(db: DbOrTx, pageId: string, keep = REVISIONS_KEPT) {
  const newest = await db
    .select({ id: pageRevisions.id })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.createdAt), desc(pageRevisions.id))
    .limit(keep);
  if (newest.length < keep) return;
  await db.delete(pageRevisions).where(
    and(
      eq(pageRevisions.pageId, pageId),
      notInArray(
        pageRevisions.id,
        newest.map((r) => r.id),
      ),
    ),
  );
}

/** The sections a new page starts with: its own title as the heading, the rest empty. */
export function starterSections(starter: PageStarter, title: string): StoredSection[] {
  switch (starter) {
    case "blank":
      return [];
    case "standard":
      return [starterSection("hero_simple", title), starterSection("text")];
    case "landing":
      return [
        starterSection("hero_simple", title),
        starterSection("promise_strip"),
        starterSection("form"),
        starterSection("testimonials"),
      ];
    case "legal": {
      const text = starterSection("text");
      return [{ ...text, props: { ...text.props, maxWidth: "normal" } }];
    }
  }
}

/** A page's own address must not also redirect somewhere else (an old rule from a move). */
export async function clearRedirectFrom(db: DbOrTx, slug: string): Promise<void> {
  await db
    .delete(seoRedirects)
    .where(
      and(
        eq(seoRedirects.agencyId, currentAgencyId()),
        eq(seoRedirects.fromPath, normalizePath(`/${slug}`)),
      ),
    );
}
