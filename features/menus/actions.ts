"use server";

import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { ActionError, adminAction } from "@/lib/actions";
import { tags } from "@/lib/cache-tags";
import { missingTargets, writeMenu } from "./mutations";
import { parseStoredItems, menuInputSchema } from "./schema";

/** Website -> Menus: saves one menu (header, phone menu or a footer column). */
export const saveMenu = adminAction(menuInputSchema, { write: true }, async (data, ctx) => {
  const db = await getDb();
  const saved = await db.transaction(async (tx) => {
    const missing = await missingTargets(tx, data.items);
    if (Object.keys(missing).length > 0)
      throw new ActionError(
        "Some links point at something that was deleted.",
        "VALIDATION",
        missing,
      );
    return writeMenu(tx, data, ctx.actor);
  });
  updateTag(tags.menus);
  return {
    location: saved.location,
    title: saved.title ?? "",
    items: parseStoredItems(saved.items, saved.location),
    updatedAt: saved.updatedAt.toISOString(),
  };
});
