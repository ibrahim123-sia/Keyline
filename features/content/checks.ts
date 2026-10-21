import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { ActionError } from "@/lib/actions";

/** Reference checks shared by the content editors: every id points at something usable. */

export const fieldError = (field: string, message: string): never => {
  throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
    [field]: [message],
  });
};

/** Library images of this agency (covers, share images, photos). Nulls are skipped. */
export async function checkImages(
  db: DbOrTx,
  refs: Array<{ id: string | null | undefined; field: string }>,
): Promise<void> {
  const ids = [...new Set(refs.map((r) => r.id).filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: media.id, mime: media.mime, status: media.status })
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.agencyId, currentAgencyId())));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const ref of refs) {
    if (!ref.id) continue;
    const file = byId.get(ref.id);
    if (!file || file.status === "failed")
      fieldError(ref.field, "This image was removed from the library. Choose another one.");
    if (!file!.mime.startsWith("image/")) fieldError(ref.field, "Choose an image.");
  }
}

/** Listings of this agency that are not deleted. */
export async function checkListings(db: DbOrTx, ids: string[], field: string): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        inArray(properties.id, unique),
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
      ),
    );
  if (rows.length !== unique.length)
    fieldError(field, "A chosen listing was deleted. Remove it and save again.");
}

/** An agent profile of this agency. */
export async function checkAgent(db: DbOrTx, id: string | null, field: string): Promise<void> {
  if (!id) return;
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.agencyId, currentAgencyId())));
  if (!row) fieldError(field, "This agent profile no longer exists.");
}

/** An admin user of this agency (a byline). */
export async function checkAdminUser(db: DbOrTx, id: string | null, field: string): Promise<void> {
  if (!id) return;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.agencyId, currentAgencyId()), eq(users.role, "admin")));
  if (!row) fieldError(field, "This admin user no longer exists.");
}
