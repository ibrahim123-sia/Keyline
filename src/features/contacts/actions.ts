"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { adminAction } from "@/lib/actions";
import { mergeableContactFields, mergeContacts } from "./merge";

const pick = z.enum(["keep", "other"]);

/** Merge duplicate contacts with a field-by-field choice (09 §4 Contacts). */
export const mergeContactsAction = adminAction(
  z
    .object({
      keepId: z.uuid(),
      otherId: z.uuid(),
      pick: z.partialRecord(z.enum(mergeableContactFields), pick).default({}),
    })
    .strict(),
  { write: true },
  async ({ keepId, otherId, pick }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => mergeContacts(tx, { keepId, otherId, pick, actor: ctx.actor }));
    return { id: keepId };
  },
);
