import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { testimonials } from "@/db/schema/content";
import { media } from "@/db/schema/media";
import { listingOptionsById, type ListingOption } from "@/features/content/listing-options";
import { getPublicMedia, mediaUrl, type PublicMedia } from "@/features/media/queries";
import { tags } from "@/lib/cache-tags";
import type { TestimonialInput } from "./schema";

export type TestimonialRow = {
  id: string;
  name: string;
  isPublished: boolean;
  photoUrl: string | null;
  listing: ListingOption | null;
  data: TestimonialInput;
};

/** Admin -> Website -> Testimonials, in their order. */
export async function listTestimonialsAdmin(db: DbOrTx): Promise<TestimonialRow[]> {
  const rows = await db
    .select({ t: testimonials, photoKey: media.r2Key })
    .from(testimonials)
    .leftJoin(media, and(eq(media.id, testimonials.photoId), eq(media.status, "ready")))
    .where(eq(testimonials.agencyId, currentAgencyId()))
    .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt));
  const listings = new Map(
    (
      await listingOptionsById(
        db,
        rows.flatMap((r) => (r.t.propertyId ? [r.t.propertyId] : [])),
      )
    ).map((o) => [o.id, o]),
  );
  return rows.map(({ t, photoKey }) => ({
    id: t.id,
    name: t.name,
    isPublished: t.isPublished,
    photoUrl: photoKey ? mediaUrl(photoKey) : null,
    listing: t.propertyId ? (listings.get(t.propertyId) ?? null) : null,
    data: {
      name: t.name,
      roleText: t.roleText,
      quote: t.quote,
      rating: t.rating,
      photoId: t.photoId,
      propertyId: t.propertyId,
      isPublished: t.isPublished,
    },
  }));
}

export type PublicTestimonial = {
  id: string;
  name: string;
  roleText: string | null;
  quote: string;
  rating: number | null;
  photo: PublicMedia | null;
};

/** Published testimonials in order (for the page builder's testimonials section). */
export async function listPublicTestimonials(ids?: string[]): Promise<PublicTestimonial[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.testimonials);
  const db = await getDb();
  const rows = await db
    .select()
    .from(testimonials)
    .where(
      and(
        eq(testimonials.agencyId, currentAgencyId()),
        eq(testimonials.isPublished, true),
        ids?.length ? inArray(testimonials.id, ids) : undefined,
      ),
    )
    .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt));
  const out: PublicTestimonial[] = [];
  for (const t of rows)
    out.push({
      id: t.id,
      name: t.name,
      roleText: t.roleText,
      quote: t.quote,
      rating: t.rating,
      photo: await getPublicMedia(t.photoId),
    });
  return out;
}
