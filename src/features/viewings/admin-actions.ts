"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { adminAction } from "@/lib/actions";
import {
  agencyInstant,
  createAdminViewing,
  deleteOverride,
  moveViewing,
  saveOverride,
  saveViewingNotes,
  setViewingStatus,
} from "./admin";

const isoDate = z.iso.date();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 14:30");

/** A time as an instant, or as the agency's date and time. */
const when = z.union([
  z.object({ start: z.iso.datetime({ offset: true }) }),
  z.object({ date: isoDate, time: hhmm }),
]);

async function instantOf(db: Awaited<ReturnType<typeof getDb>>, w: z.infer<typeof when>) {
  return "start" in w ? new Date(w.start) : agencyInstant(db, w.date, w.time);
}

export const setViewingStatusAction = adminAction(
  z.object({ id: z.uuid(), status: z.enum(["confirmed", "done", "no_show", "cancelled"]) }),
  { write: true },
  async ({ id, status }, ctx) => {
    const row = await setViewingStatus(await getDb(), { id, status, actor: ctx.actor });
    return { id: row.id, status: row.status };
  },
);

export const moveViewingAction = adminAction(
  z.object({
    id: z.uuid(),
    when,
    agentId: z.uuid().nullable().optional(),
    force: z.boolean().default(false),
  }),
  { write: true },
  async ({ id, when: w, agentId, force }, ctx) => {
    const db = await getDb();
    const start = await instantOf(db, w);
    await moveViewing(db, { id, start, agentId, force, actor: ctx.actor });
    return { id, start: start.toISOString() };
  },
);

export const saveViewingNotesAction = adminAction(
  z.object({ id: z.uuid(), notes: z.string().trim().max(2000) }),
  { write: true },
  async ({ id, notes }, ctx) => {
    await saveViewingNotes(await getDb(), { id, notes, actor: ctx.actor });
    return { id };
  },
);

export const createViewingAction = adminAction(
  z
    .object({
      leadId: z.uuid().nullable().default(null),
      contact: z
        .object({
          name: z.string().trim().max(120),
          email: z.union([z.email("Enter a valid email address"), z.literal("")]),
          phone: z.string().trim().max(30),
        })
        .nullable()
        .default(null),
      propertyId: z.uuid().nullable().default(null),
      projectId: z.uuid().nullable().default(null),
      agentId: z.uuid().nullable().default(null),
      type: z.enum(["in_person", "video"]),
      when,
      notes: z.string().trim().max(2000).default(""),
      force: z.boolean().default(false),
    })
    .superRefine((v, ctx) => {
      if (!v.leadId && !v.contact?.name)
        ctx.addIssue({ code: "custom", path: ["contact", "name"], message: "Enter who is coming" });
      if (!v.leadId && v.contact && !v.contact.phone && !v.contact.email)
        ctx.addIssue({
          code: "custom",
          path: ["contact", "phone"],
          message: "Enter a phone number or an email address",
        });
    }),
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const start = await instantOf(db, input.when);
    return createAdminViewing(
      db,
      {
        leadId: input.leadId,
        contact: input.contact,
        propertyId: input.propertyId,
        projectId: input.projectId,
        agentId: input.agentId,
        type: input.type,
        start,
        notes: input.notes,
        force: input.force,
      },
      ctx.actor,
    );
  },
);

const range = z.object({ from: hhmm, to: hhmm }).refine((r) => r.from < r.to, {
  message: "The end must be after the start",
});

export const saveOverrideAction = adminAction(
  z
    .object({
      agentId: z.uuid(),
      date: isoDate,
      blocked: z.boolean(),
      hours: z.array(range).max(4).nullable().default(null),
      note: z.string().trim().max(200).default(""),
    })
    .superRefine((v, ctx) => {
      if (!v.blocked && !v.hours?.length)
        ctx.addIssue({ code: "custom", path: ["hours"], message: "Add the hours for that day" });
    }),
  { write: true },
  async (input, ctx) => {
    const row = await saveOverride(await getDb(), { ...input, actor: ctx.actor });
    return { id: row.id };
  },
);

export const deleteOverrideAction = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    await deleteOverride(await getDb(), id, ctx.actor);
    return { id };
  },
);
