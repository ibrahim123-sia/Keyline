"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { parseSearch } from "@/features/search/params";
import { loadSettings } from "@/features/settings/queries";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { getCurrentUser, requireCustomer } from "@/lib/auth/guards";
import { ensureCustomerLead } from "./link";
import { filtersToStored } from "./searches";
import {
  compareIds,
  createList,
  deleteList,
  deleteSearch,
  moveHome,
  renameList,
  saveHome,
  saveSearch,
  setHomeNote,
  shareList,
  toggleCompare,
  unsaveHome,
  unshareList,
  updateSearch,
} from "./store";

const id = z.uuid();
const target = z
  .object({ propertyId: id.nullable().default(null), projectId: id.nullable().default(null) })
  .refine((t) => Boolean(t.propertyId) !== Boolean(t.projectId), "Choose one home");
const listName = z
  .string()
  .trim()
  .min(1, "Give the list a name")
  .max(60, "Use at most 60 characters");
const frequency = z.enum(["instant", "daily", "weekly", "off"]);

/**
 * Customer actions (12): signed-in customers only (requireCustomer), and every store function
 * filters by their own id. Compare also works for guests through the visitor id.
 */
async function run<S extends z.ZodType, R>(
  schema: S,
  input: unknown,
  handler: (data: z.output<S>, userId: string) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const user = await requireCustomer();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      return {
        ok: false,
        error: formErrors[0] ?? "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors,
      };
    }
    return { ok: true, data: await handler(parsed.data, user.id) };
  } catch (err) {
    return toActionError(err);
  }
}

/** The heart on cards and pages: save or unsave a home. */
export async function setHomeSaved(input: {
  propertyId?: string | null;
  projectId?: string | null;
  saved: boolean;
}) {
  return run(target.and(z.object({ saved: z.boolean() })), input, async (t, userId) => {
    const db = await getDb();
    if (t.saved) await saveHome(db, userId, t);
    else await unsaveHome(db, userId, t);
    return { saved: t.saved };
  });
}

export async function moveSavedHome(input: { id: string; listId: string }) {
  return run(z.object({ id, listId: id }), input, async (d, userId) => {
    await moveHome(await getDb(), userId, d.id, d.listId);
    return { moved: true };
  });
}

export async function setSavedHomeNote(input: { id: string; note: string }) {
  return run(
    z.object({ id, note: z.string().max(500, "Use at most 500 characters") }),
    input,
    async (d, userId) => {
      await setHomeNote(await getDb(), userId, d.id, d.note);
      return { saved: true };
    },
  );
}

export async function createSavedList(input: { name: string }) {
  return run(z.object({ name: listName }), input, async (d, userId) => ({
    id: await createList(await getDb(), userId, d.name),
  }));
}

export async function renameSavedList(input: { id: string; name: string }) {
  return run(z.object({ id, name: listName }), input, async (d, userId) => {
    await renameList(await getDb(), userId, d.id, d.name);
    return { renamed: true };
  });
}

export async function deleteSavedList(input: { id: string }) {
  return run(z.object({ id }), input, async (d, userId) => {
    await deleteList(await getDb(), userId, d.id);
    return { deleted: true };
  });
}

export async function setListShared(input: { id: string; shared: boolean }) {
  return run(z.object({ id, shared: z.boolean() }), input, async (d, userId) => {
    const db = await getDb();
    if (!d.shared) {
      await unshareList(db, userId, d.id);
      return { token: null };
    }
    return { token: await shareList(db, userId, d.id) };
  });
}

/** "Save search" on a search page: `query` is the page's full search query string. */
export async function saveCurrentSearch(input: {
  query: string;
  name: string;
  frequency: "instant" | "daily" | "weekly" | "off";
}) {
  return run(
    z.object({
      query: z.string().max(4000),
      name: z.string().trim().min(1, "Give the search a name").max(80, "Use at most 80 characters"),
      frequency,
    }),
    input,
    async (d, userId) => {
      const db = await getDb();
      const filters = filtersToStored(parseSearch(new URLSearchParams(d.query)));
      const searchId = await saveSearch(db, userId, {
        name: d.name,
        filters,
        frequency: d.frequency,
      });
      // A saved search shows intent: with "on intent" (or "always") it is a lead (09 §1 #14, #15).
      const leads = await loadSettings("leads", db);
      if (leads.signupCreatesLead !== "never")
        await ensureCustomerLead(db, userId, { source: "saved_search", filters });
      return { id: searchId };
    },
  );
}

export async function editSavedSearch(input: {
  id: string;
  name?: string;
  frequency?: "instant" | "daily" | "weekly" | "off";
}) {
  return run(
    z.object({
      id,
      name: z.string().trim().min(1, "Give the search a name").max(80).optional(),
      frequency: frequency.optional(),
    }),
    input,
    async (d, userId) => {
      await updateSearch(await getDb(), userId, d.id, d);
      return { saved: true };
    },
  );
}

export async function removeSavedSearch(input: { id: string }) {
  return run(z.object({ id }), input, async (d, userId) => {
    await deleteSearch(await getDb(), userId, d.id);
    return { deleted: true };
  });
}

/** "Add to compare" (up to 4), for customers and guests (by visitor id). */
export async function toggleCompareHome(input: {
  propertyId: string;
}): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const parsed = z.object({ propertyId: id }).safeParse(input);
    if (!parsed.success)
      return { ok: false, error: "Choose a home to compare.", code: "VALIDATION" };
    const user = await getCurrentUser();
    const visitorKey = user ? null : await currentVisitorKey();
    if (!user && !visitorKey)
      return { ok: false, error: "Please allow cookies to compare homes.", code: "NO_VISITOR" };
    const owner = user ? { userId: user.id } : { visitorKey: visitorKey! };
    const db = await getDb();
    return { ok: true, data: { ids: await toggleCompare(db, owner, parsed.data.propertyId) } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function clearCompare(): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const user = await getCurrentUser();
    const visitorKey = user ? null : await currentVisitorKey();
    if (!user && !visitorKey) return { ok: true, data: { ids: [] } };
    const owner = user ? { userId: user.id } : { visitorKey: visitorKey! };
    const db = await getDb();
    for (const pid of await compareIds(db, owner)) await toggleCompare(db, owner, pid);
    return { ok: true, data: { ids: [] } };
  } catch (err) {
    return toActionError(err);
  }
}
