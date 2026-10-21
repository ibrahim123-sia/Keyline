import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { postCategories, posts } from "@/db/schema/content";
import type { MediaUse } from "@/features/media/usage";

/** Where website content uses library files (08 §3-5), for features/media/usage.ts. */

type Source = (db: DbOrTx, ids: string[]) => Promise<MediaUse[]>;

/** Library ids of the images in a rich text body, as a jsonb array of strings. */
const bodyMediaIds = (body: unknown) =>
  sql<
    string[] | null
  >`jsonb_path_query_array(${body}, 'lax $.content[*] ? (@.type == "image").attrs.mediaId')`;

/** The body array holds any of these ids. */
const holdsAny = (array: SQL, ids: string[]) =>
  sql`${array} ?| array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`;

export const postUses: Source = async (db, ids) => {
  const inBody = bodyMediaIds(posts.body);
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      coverId: posts.coverId,
      ogImageId: posts.ogImageId,
      bodyIds: inBody,
    })
    .from(posts)
    .where(
      and(
        eq(posts.agencyId, currentAgencyId()),
        isNull(posts.deletedAt),
        or(inArray(posts.coverId, ids), inArray(posts.ogImageId, ids), holdsAny(inBody, ids)),
      ),
    );
  return rows.flatMap((r) => {
    const href = `/admin/website/blog/${r.id}`;
    const uses: MediaUse[] = [];
    if (r.coverId && ids.includes(r.coverId))
      uses.push({ mediaId: r.coverId, label: `Post ${r.title}: cover`, href });
    if (r.ogImageId && ids.includes(r.ogImageId))
      uses.push({ mediaId: r.ogImageId, label: `Post ${r.title}: share image`, href });
    for (const id of new Set(r.bodyIds ?? []))
      if (ids.includes(id))
        uses.push({ mediaId: id, label: `Post ${r.title}: image in the text`, href });
    return uses;
  });
};

export const postCategoryUses: Source = async (db, ids) => {
  const rows = await db
    .select({
      id: postCategories.id,
      name: postCategories.name,
      ogImageId: postCategories.ogImageId,
    })
    .from(postCategories)
    .where(
      and(eq(postCategories.agencyId, currentAgencyId()), inArray(postCategories.ogImageId, ids)),
    );
  return rows.map((r) => ({
    mediaId: r.ogImageId!,
    label: `Blog category ${r.name}: share image`,
    href: "/admin/website/blog/categories",
  }));
};
