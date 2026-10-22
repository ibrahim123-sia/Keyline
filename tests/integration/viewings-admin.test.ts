import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leadEvents, leads, viewings } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { jobRuns } from "@/db/schema/system";
import { captureLead } from "@/features/leads/capture";
import { patchSettings } from "@/features/settings/mutations";
import {
  calendarRange,
  createAdminViewing,
  deleteOverride,
  listCalendarViewings,
  moveViewing,
  saveOverride,
  setViewingStatus,
} from "@/features/viewings/admin";
import { setViewingStatusAction } from "@/features/viewings/admin-actions";
import { availableSlots } from "@/features/viewings/availability";
import { zonedDate, zonedTime } from "@/features/viewings/slots";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const TZ = "Asia/Dubai";

async function world() {
  const db = await getDb();
  await patchSettings(db, "general", { timeZone: TZ, firstDayOfWeek: 1 }, actor);
  await patchSettings(db, "market", { phoneCountryCode: "+971" }, actor);
  const layla = newId();
  const omar = newId();
  await db.insert(agents).values([
    { id: layla, name: "Layla Haddad", slug: "layla" },
    { id: omar, name: "Omar Nasser", slug: "omar", sortOrder: 1 },
  ]);
  const listing = newId();
  await db.insert(properties).values({
    id: listing,
    reference: "HD-2041",
    title: "Two bed",
    slug: "two-bed",
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    agentId: layla,
  });
  const lead = await captureLead(db, {
    source: "form",
    contact: { name: "Sam Visitor", email: "sam@example.com", phone: "0501234567" },
    propertyId: listing,
  });
  return { db, layla, omar, listing, lead };
}

const jobs = async (db: Awaited<ReturnType<typeof getDb>>) =>
  (await db.select({ name: jobRuns.name, payload: jobRuns.payload }).from(jobRuns)).map(
    (j) => ({ name: j.name, ...(j.payload as Record<string, unknown>) }) as Record<string, unknown>,
  );

/** A day well inside the booking window, in the agency's time zone. */
const dayAhead = (n: number) => zonedDate(new Date(Date.now() + n * 86_400_000), TZ);

describe("viewings admin (09 §5)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "agent_availability_overrides",
      "viewings",
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "properties",
      "agents",
      "job_runs",
      "email_log",
      "settings",
      "audit_log",
    );
  });

  it("books for a lead at a free time; outside free times only when the team confirms", async () => {
    const { db, layla, listing, lead } = await world();
    const free = (await availableSlots(db, layla)).slots[0]!.start;
    await db.delete(jobRuns);
    const made = await createAdminViewing(
      db,
      {
        leadId: lead.leadId,
        propertyId: listing,
        type: "in_person",
        start: free,
        notes: "",
        force: false,
      },
      actor,
    );
    const [v] = await db.select().from(viewings).where(eq(viewings.id, made.id));
    expect(v).toMatchObject({
      leadId: lead.leadId,
      agentId: layla,
      status: "confirmed",
      source: "admin",
      startsAt: free,
    });
    expect(v!.manageTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await jobs(db)).map((j) => [j.name, j.event ?? null])).toEqual([
      ["viewing.notify", "booked"],
      ["calendar.sync", null],
    ]);
    const types = (
      await db
        .select({ type: leadEvents.type })
        .from(leadEvents)
        .where(eq(leadEvents.leadId, lead.leadId))
    ).map((e) => e.type);
    expect(types).toContain("viewing_booked");

    // 03:00 in Dubai is nobody's working time.
    const night = zonedTime(dayAhead(3), 180, TZ);
    const nightViewing = {
      leadId: lead.leadId,
      propertyId: listing,
      type: "video" as const,
      start: night,
      notes: "Calls from London",
    };
    await expect(
      createAdminViewing(db, { ...nightViewing, force: false }, actor),
    ).rejects.toMatchObject({ code: "OUTSIDE_FREE_TIMES" });
    await createAdminViewing(db, { ...nightViewing, force: true }, actor);
    expect(await db.select().from(viewings)).toHaveLength(2);
  });

  it("a new person coming to a viewing becomes a lead", async () => {
    const { db, layla, listing } = await world();
    const free = (await availableSlots(db, layla)).slots[0]!.start;
    const made = await createAdminViewing(
      db,
      {
        contact: { name: "Walk In", email: "", phone: "0509998877" },
        propertyId: listing,
        type: "in_person",
        start: free,
        notes: "",
        force: false,
      },
      actor,
    );
    const [lead] = await db.select().from(leads).where(eq(leads.id, made.leadId!));
    expect(lead).toMatchObject({ source: "manual", sourceDetail: "viewing" });
  });

  it("moves: free times, clashes, another agent; status changes tell the visitor", async () => {
    const { db, layla, omar, listing, lead } = await world();
    const slots = (await availableSlots(db, layla)).slots;
    const a = await createAdminViewing(
      db,
      {
        leadId: lead.leadId,
        propertyId: listing,
        type: "in_person",
        start: slots[0]!.start,
        notes: "",
        force: false,
      },
      actor,
    );
    const b = await createAdminViewing(
      db,
      {
        leadId: lead.leadId,
        propertyId: listing,
        type: "in_person",
        start: slots[4]!.start,
        notes: "",
        force: false,
      },
      actor,
    );
    await db
      .update(viewings)
      .set({ reminderDaySentAt: new Date(), googleEventId: "evt-a" })
      .where(eq(viewings.id, a.id));
    await db.delete(jobRuns);

    // Onto b's time: a clash.
    await expect(
      moveViewing(db, { id: a.id, start: slots[4]!.start, force: false, actor }),
    ).rejects.toMatchObject({ code: "OUTSIDE_FREE_TIMES" });
    await moveViewing(db, { id: a.id, start: slots[8]!.start, force: false, actor });
    const [moved] = await db.select().from(viewings).where(eq(viewings.id, a.id));
    expect(moved).toMatchObject({ startsAt: slots[8]!.start, reminderDaySentAt: null });
    expect(moved!.endsAt.getTime() - moved!.startsAt.getTime()).toBe(30 * 60_000);

    // To Omar at the same time: the event leaves Layla's calendar.
    await moveViewing(db, { id: a.id, start: slots[8]!.start, agentId: omar, force: false, actor });
    const syncs = (await jobs(db)).filter((j) => j.name === "calendar.sync");
    expect(syncs.at(-1)).toMatchObject({
      viewingId: a.id,
      previous: { agentId: layla, eventId: "evt-a" },
    });
    expect((await db.select().from(viewings).where(eq(viewings.id, a.id)))[0]).toMatchObject({
      agentId: omar,
      googleEventId: null,
    });
    const notices = (await jobs(db)).filter((j) => j.name === "viewing.notify").map((j) => j.event);
    // Only a change of time is news for the visitor.
    expect(notices).toEqual(["rescheduled"]);

    await db.delete(jobRuns);
    await setViewingStatus(db, { id: a.id, status: "done", actor });
    await setViewingStatus(db, { id: b.id, status: "cancelled", actor });
    expect((await jobs(db)).filter((j) => j.name === "viewing.notify").map((j) => j.event)).toEqual(
      ["feedback", "cancelled"],
    );
    const [done] = await db.select().from(viewings).where(eq(viewings.id, a.id));
    expect(done!.feedbackRequestedAt).not.toBeNull();
    const types = (await db.select({ type: leadEvents.type }).from(leadEvents)).map((e) => e.type);
    expect(types).toContain("viewing_done");
    await expect(
      moveViewing(db, { id: b.id, start: slots[9]!.start, force: true, actor }),
    ).rejects.toMatchObject({ code: "LOCKED" });

    // Read-only admins only look.
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await setViewingStatusAction({ id: a.id, status: "no_show" })).toMatchObject({
      ok: false,
    });
  });

  it("days off and other hours change the free times", async () => {
    const { db, layla } = await world();
    const before = (await availableSlots(db, layla)).slots;
    const day = zonedDate(before[0]!.start, TZ);
    const off = await saveOverride(db, {
      agentId: layla,
      date: day,
      blocked: true,
      hours: null,
      note: "Leave",
      actor,
    });
    let slots = (await availableSlots(db, layla)).slots;
    expect(slots.some((s) => zonedDate(s.start, TZ) === day)).toBe(false);

    await saveOverride(db, {
      agentId: layla,
      date: day,
      blocked: false,
      hours: [{ from: "20:00", to: "21:00" }],
      note: "",
      actor,
    });
    slots = (await availableSlots(db, layla)).slots.filter((s) => zonedDate(s.start, TZ) === day);
    expect(slots.map((s) => s.start.toISOString())).toEqual(
      [zonedTime(day, 20 * 60, TZ), zonedTime(day, 20 * 60 + 30, TZ)]
        .filter((d) => d.getTime() > Date.now() + 4 * 3_600_000)
        .map((d) => d.toISOString()),
    );
    await deleteOverride(db, off.id, actor);
    expect((await availableSlots(db, layla)).slots.length).toBe(before.length);
  });

  it("the calendar shows a week from the agency's first weekday, filtered", async () => {
    const { db, layla, listing, lead } = await world();
    const free = (await availableSlots(db, layla)).slots[0]!.start;
    await createAdminViewing(
      db,
      {
        leadId: lead.leadId,
        propertyId: listing,
        type: "video",
        start: free,
        notes: "",
        force: false,
      },
      actor,
    );
    // Wednesday 21 October 2026: the week starts on Monday the 19th.
    const week = calendarRange("week", "2026-10-21", TZ, 1);
    expect(week.days).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(week.from.toISOString()).toBe("2026-10-18T20:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-10-25T20:00:00.000Z");
    const range = calendarRange("week", zonedDate(free, TZ), TZ, 1);
    expect(await listCalendarViewings(db, { ...range, agentId: layla })).toEqual([
      expect.objectContaining({
        what: "HD-2041 · Two bed",
        contactName: "Sam Visitor",
        type: "video",
      }),
    ]);
    expect(await listCalendarViewings(db, { ...range, type: "in_person" })).toEqual([]);
  });
});
