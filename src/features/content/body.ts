import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { properties } from "@/db/schema/properties";
import { mediaUrl } from "@/features/media/queries";
import { isLiveStatus } from "@/features/properties/status";
import { siteOrigin } from "@/features/site/url";
import {
  postReferences,
  readingMinutes,
  renderPostHtml,
  withEditorLabels,
  type PostDoc,
  type PostMedia,
} from "@/lib/rich-text-post";
import { fieldError } from "./checks";

export type PreparedBody = {
  /** The document with its editor labels set by the server. */
  body: PostDoc | null;
  bodyHtml: string | null;
  readingMinutes: number;
  mediaIds: string[];
  propertyIds: string[];
};

/**
 * A post or area guide body before it is stored: every image is a library image of this
 * agency and every listing card points at a listing that still exists. Renders `body_html`.
 */
export async function prepareBody(
  db: DbOrTx,
  doc: PostDoc | null,
  field = "body",
): Promise<PreparedBody> {
  if (!doc) return { body: null, bodyHtml: null, readingMinutes: 1, mediaIds: [], propertyIds: [] };
  const { mediaIds, propertyIds } = postReferences(doc);
  const agency = currentAgencyId();

  const files = mediaIds.length
    ? await db
        .select({
          id: media.id,
          r2Key: media.r2Key,
          mime: media.mime,
          status: media.status,
          width: media.width,
          height: media.height,
          alt: media.alt,
        })
        .from(media)
        .where(and(inArray(media.id, mediaIds), eq(media.agencyId, agency)))
    : [];
  const fileById = new Map(files.map((f) => [f.id, f]));
  for (const id of mediaIds) {
    const f = fileById.get(id);
    if (!f || f.status === "failed")
      fieldError(
        field,
        "An image in the text was removed from the library. Take it out and save again.",
      );
    if (!f!.mime.startsWith("image/")) fieldError(field, "Only images can go in the text.");
  }

  const homes = propertyIds.length
    ? await db
        .select({
          id: properties.id,
          slug: properties.slug,
          reference: properties.reference,
          title: properties.title,
          status: properties.status,
        })
        .from(properties)
        .where(
          and(
            inArray(properties.id, propertyIds),
            eq(properties.agencyId, agency),
            isNull(properties.deletedAt),
          ),
        )
    : [];
  if (homes.length !== propertyIds.length)
    fieldError(
      field,
      "A listing card points at a deleted listing. Take the card out and save again.",
    );

  const body = withEditorLabels(doc, {
    media: new Map(files.map((f) => [f.id, mediaUrl(f.r2Key)])),
    properties: new Map(homes.map((h) => [h.id, `${h.reference} · ${h.title}`])),
  });
  const ready = new Map<string, PostMedia>(
    files
      .filter((f) => f.status === "ready")
      .map((f) => [
        f.id,
        { url: mediaUrl(f.r2Key), width: f.width, height: f.height, alt: f.alt ?? "" },
      ]),
  );
  const html = renderPostHtml(body, {
    media: ready,
    siteOrigin: siteOrigin(),
    properties: new Map(
      homes
        .filter((h) => isLiveStatus(h.status))
        .map((h) => [h.id, { href: `/property/${h.slug}`, title: h.title }]),
    ),
  });
  return {
    body,
    bodyHtml: html || null,
    readingMinutes: readingMinutes(body),
    mediaIds,
    propertyIds,
  };
}

/** Ready library images by id, for rendering a body on the site. */
export async function bodyMedia(db: DbOrTx, ids: string[]): Promise<Map<string, PostMedia>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: media.id,
      r2Key: media.r2Key,
      width: media.width,
      height: media.height,
      alt: media.alt,
    })
    .from(media)
    .where(
      and(inArray(media.id, ids), eq(media.agencyId, currentAgencyId()), eq(media.status, "ready")),
    );
  return new Map(
    rows.map((r) => [
      r.id,
      { url: mediaUrl(r.r2Key), width: r.width, height: r.height, alt: r.alt ?? "" },
    ]),
  );
}
