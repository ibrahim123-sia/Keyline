import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { faqs, testimonials } from "@/db/schema/content";
import { media } from "@/db/schema/media";
import { properties } from "@/db/schema/properties";
import { deleteFaq, reorderFaqs, saveFaq, setFaqPublished } from "@/features/faqs/actions";
import { listFaqsAdmin, listPublicFaqs } from "@/features/faqs/queries";
import { emptyFaq } from "@/features/faqs/schema";
import { mediaUsage } from "@/features/media/usage";
import {
  deleteTestimonial,
  reorderTestimonials,
  saveTestimonial,
  setTestimonialPublished,
} from "@/features/testimonials/actions";
import { listPublicTestimonials, listTestimonialsAdmin } from "@/features/testimonials/queries";
import { emptyTestimonial } from "@/features/testimonials/schema";
import { newId } from "@/lib/ids";
import type { RichDoc } from "@/lib/rich-text";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const ids = { photo: newId(), home: newId() };
const answer = (text: string): RichDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "bold" }] }] }],
});

describe("testimonials and FAQs", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("testimonials", "faqs", "properties", "media", "audit_log");
    const db = await getDb();
    await db.insert(media).values({
      id: ids.photo,
      r2Key: "2026/10/testimonial/aisha.jpg",
      fileName: "aisha.jpg",
      mime: "image/jpeg",
      status: "ready",
    });
    await db.insert(properties).values({
      id: ids.home,
      reference: "TF-1",
      title: "Two bed by the park",
      slug: "two-bed-by-the-park",
      purpose: "sale",
      status: "sold",
      currency: "AED",
    });
  });

  it("adds, orders, publishes and deletes testimonials", async () => {
    const db = await getDb();
    const a = await saveTestimonial({
      id: null,
      data: {
        ...emptyTestimonial(),
        name: "Aisha R.",
        quote: "Clear advice and no pressure.",
        rating: 5,
        photoId: ids.photo,
        propertyId: ids.home,
        isPublished: true,
      },
    });
    const b = await saveTestimonial({
      id: null,
      data: { ...emptyTestimonial(), name: "Tom B.", quote: "Quick replies." },
    });
    if (!a.ok || !b.ok) throw new Error("save");
    const bad = await saveTestimonial({
      id: null,
      data: { ...emptyTestimonial(), name: "X", quote: "", rating: 6 },
    });
    expect(!bad.ok && Object.keys(bad.fieldErrors ?? {}).sort()).toEqual(["quote", "rating"]);

    const admin = await listTestimonialsAdmin(db);
    expect(admin.map((t) => t.name)).toEqual(["Aisha R.", "Tom B."]);
    expect(admin[0]!.listing).toMatchObject({ label: "TF-1 · Two bed by the park" });
    expect((await mediaUsage(db, [ids.photo])).get(ids.photo)!.map((u) => u.label)).toEqual([
      "Testimonial from Aisha R.: photo",
    ]);

    // Only published ones show, in the chosen order.
    expect((await listPublicTestimonials()).map((t) => t.name)).toEqual(["Aisha R."]);
    await setTestimonialPublished({ id: b.data.id, published: true });
    await reorderTestimonials({ ids: [b.data.id, a.data.id] });
    expect((await listPublicTestimonials()).map((t) => t.name)).toEqual(["Tom B.", "Aisha R."]);

    expect((await deleteTestimonial({ id: a.data.id })).ok).toBe(true);
    expect(await db.select({ name: testimonials.name }).from(testimonials)).toEqual([
      { name: "Tom B." },
    ]);
    const [file] = await db.select().from(media).where(eq(media.id, ids.photo));
    expect(file!.usedCount).toBe(0);
  });

  it("keeps questions by group with rich answers and their own order", async () => {
    const db = await getDb();
    const save = async (question: string, group: "buying" | "renting", published = true) => {
      const res = await saveFaq({
        id: null,
        data: {
          ...emptyFaq(group),
          question,
          answer: answer(`${question} answer`),
          isPublished: published,
        },
      });
      if (!res.ok) throw new Error(res.error);
      return res.data.id;
    };
    const q1 = await save("Do I need a mortgage in principle?", "buying");
    const q2 = await save("What fees do buyers pay?", "buying");
    const q3 = await save("How much is the deposit?", "renting", false);

    const empty = await saveFaq({ id: null, data: { ...emptyFaq(), question: "No answer?" } });
    expect(!empty.ok && empty.fieldErrors?.answer).toEqual(["Write the answer"]);

    const [row] = await db.select().from(faqs).where(eq(faqs.id, q1));
    expect(row!.answerHtml).toBe(
      "<p><strong>Do I need a mortgage in principle? answer</strong></p>",
    );

    await reorderFaqs({ group: "buying", ids: [q2, q1] });
    expect((await listPublicFaqs(["buying"])).map((f) => f.question)).toEqual([
      "What fees do buyers pay?",
      "Do I need a mortgage in principle?",
    ]);
    expect((await listPublicFaqs(["renting"])).map((f) => f.question)).toEqual([]);
    await setFaqPublished({ id: q3, published: true });
    expect((await listPublicFaqs(["renting"])).map((f) => f.question)).toEqual([
      "How much is the deposit?",
    ]);

    // Moving a question to another group puts it at the end there.
    await saveFaq({
      id: q1,
      data: {
        question: "Do I need a mortgage in principle?",
        answer: answer("Yes."),
        group: "renting",
        isPublished: true,
      },
    });
    const moved = await db
      .select({ question: faqs.question, sortOrder: faqs.sortOrder })
      .from(faqs)
      .where(eq(faqs.group, "renting"))
      .orderBy(asc(faqs.sortOrder));
    expect(moved.map((m) => m.question)).toEqual([
      "How much is the deposit?",
      "Do I need a mortgage in principle?",
    ]);

    expect((await deleteFaq({ id: q2 })).ok).toBe(true);
    expect((await listFaqsAdmin(db)).map((f) => f.question).sort()).toEqual([
      "Do I need a mortgage in principle?",
      "How much is the deposit?",
    ]);
  });
});
