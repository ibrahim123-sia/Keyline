import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { faqs } from "@/db/schema/content";
import { tags } from "@/lib/cache-tags";
import type { FaqGroup, FaqInput } from "./schema";

export type FaqRow = { id: string; question: string; isPublished: boolean; data: FaqInput };

/** Admin -> Website -> FAQs: the shared questions, by group and in order. */
export async function listFaqsAdmin(db: DbOrTx): Promise<FaqRow[]> {
  const rows = await db
    .select()
    .from(faqs)
    .where(and(eq(faqs.agencyId, currentAgencyId()), isNull(faqs.areaGuideId)))
    .orderBy(asc(faqs.group), asc(faqs.sortOrder), asc(faqs.createdAt));
  return rows.map((f) => ({
    id: f.id,
    question: f.question,
    isPublished: f.isPublished,
    data: { question: f.question, answer: f.answer, group: f.group, isPublished: f.isPublished },
  }));
}

export type PublicFaq = { id: string; question: string; answerHtml: string; group: FaqGroup };

/** Published shared questions, of some groups or all (pages, the assistant, 08 §5). */
export async function listPublicFaqs(groups?: FaqGroup[]): Promise<PublicFaq[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.faqs);
  const db = await getDb();
  return db
    .select({
      id: faqs.id,
      question: faqs.question,
      answerHtml: faqs.answerHtml,
      group: faqs.group,
    })
    .from(faqs)
    .where(
      and(
        eq(faqs.agencyId, currentAgencyId()),
        eq(faqs.isPublished, true),
        isNull(faqs.areaGuideId),
        groups?.length ? inArray(faqs.group, groups) : undefined,
      ),
    )
    .orderBy(asc(faqs.group), asc(faqs.sortOrder));
}
