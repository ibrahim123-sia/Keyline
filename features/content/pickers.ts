"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { adminAction } from "@/lib/actions";
import { listingOptionsById, searchListingOptions } from "./listing-options";

/** Listings for the content pickers: a search, or the names of chosen ones. Read-only. */
export const findListings = adminAction(
  z.object({
    q: z.string().trim().max(100).default(""),
    ids: z.array(z.uuid()).max(50).default([]),
  }),
  {},
  async ({ q, ids }) => {
    const db = await getDb();
    return ids.length ? listingOptionsById(db, ids) : searchListingOptions(db, q);
  },
);
