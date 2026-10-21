import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leadEvents, shortlists } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { emailLog } from "@/db/schema/system";
import { captureLead } from "@/features/leads/capture";
import { patchSettings } from "@/features/settings/mutations";
import { sendShortlist } from "@/features/shortlists/actions";
import {
  leadShortlists,
  loadShortlist,
  recordShortlistOpen,
  recordShortlistView,
} from "@/features/shortlists/store";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function world() {
  const db = await getDb();
  await patchSettings(db, "general", { agencyName: "Haven & Dune" }, actor);
  const layla = newId();
  await db
    .insert(agents)
    .values({ id: layla, name: "Layla Haddad", slug: "layla", email: "layla@agency.example" });
  const home = (ref: string, status: "available" | "draft") => ({
    id: newId(),
    reference: ref,
    title: `Home ${ref}`,
    slug: `home-${ref.toLowerCase()}`,
    purpose: "sale" as const,
    status,
    publishedAt: status === "draft" ? null : new Date(),
    price: 100_000_000,
    currency: "USD",
  });
  const live = home("HD-1", "available");
  const other = home("HD-2", "available");
  const draft = home("HD-3", "draft");
  await db.insert(properties).values([live, other, draft]);
  const lead = await captureLead(db, {
    source: "form",
    contact: { name: "Sara Khan", email: "sara@example.com" },
    propertyId: live.id,
  });
  return { db, lead, live, other, draft };
}

describe("send properties: shortlists (09 §4)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "shortlists",
      "properties",
      "agents",
      "lead_stages",
      "email_log",
      "message_templates",
      "job_runs",
      "settings",
      "audit_log",
    );
  });

  it("sends live homes only, emails the link and puts it on the timeline", async () => {
    const { db, lead, live, draft } = await world();
    const res = await sendShortlist({
      leadId: lead.leadId,
      propertyIds: [live.id, draft.id],
      message: "Two I like for you",
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.data).toMatchObject({ count: 1, skipped: 1, emailed: true });
    expect(res.data.url).toMatch(/\/s\/[A-Za-z0-9_-]{24}$/);
    const [mail] = await db.select().from(emailLog);
    expect(mail).toMatchObject({ to: "sara@example.com", template: "shortlist.sent" });
    expect(mail!.subject).toBe("1 home picked for you by Layla Haddad");
    expect(mail!.text).toContain("Two I like for you");
    expect(mail!.text).toContain(res.data.url);
    const [event] = await db.select().from(leadEvents).where(eq(leadEvents.type, "property_sent"));
    expect(event!.meta).toMatchObject({ count: 1, propertyIds: [live.id] });

    expect(await sendShortlist({ leadId: lead.leadId, propertyIds: [draft.id] })).toMatchObject({
      ok: false,
      code: "NOT_LIVE",
    });
    // No email address: the link is still made, to send another way.
    await db.update(contacts).set({ email: null });
    const quiet = await sendShortlist({ leadId: lead.leadId, propertyIds: [live.id] });
    expect(quiet).toMatchObject({ ok: true, data: { emailed: false } });
  });

  it("counts opens and the homes they open; the beacon endpoint counts too", async () => {
    const { db, lead, live, other } = await world();
    const res = await sendShortlist({
      leadId: lead.leadId,
      propertyIds: [live.id, other.id],
      email: false,
    });
    if (!res.ok) throw new Error(res.error);
    const token = res.data.token;
    expect(await loadShortlist(db, token)).toMatchObject({
      contactName: "Sara Khan",
      agentName: "Layla Haddad",
    });
    expect(await loadShortlist(db, "nope")).toBeNull();

    expect(await recordShortlistOpen(db, token)).toBe(true);
    expect(await recordShortlistOpen(db, token)).toBe(true);
    expect(await recordShortlistOpen(db, "x".repeat(24))).toBe(false);
    expect(await recordShortlistView(db, token, live.id)).toBe(true);
    expect(await recordShortlistView(db, token, live.id)).toBe(false);
    expect(await recordShortlistView(db, token, newId())).toBe(false);

    const { POST } = await import("@/app/api/shortlists/[token]/view/route");
    const response = await POST(
      new Request(`http://localhost/api/shortlists/${token}/view`, {
        method: "POST",
        body: JSON.stringify({ propertyId: other.id }),
      }),
      { params: Promise.resolve({ token }) } as never,
    );
    expect(response.status).toBe(204);

    const [row] = await db.select().from(shortlists);
    expect(row).toMatchObject({ openCount: 2, viewedPropertyIds: [live.id, other.id] });
    expect(row!.firstOpenedAt).not.toBeNull();
    expect(await leadShortlists(db, lead.leadId)).toEqual([
      expect.objectContaining({
        count: 2,
        references: ["HD-1", "HD-2"],
        viewed: ["HD-1", "HD-2"],
        openCount: 2,
      }),
    ]);

    adminState.user = { ...testAdmin, readOnly: true };
    expect(await sendShortlist({ leadId: lead.leadId, propertyIds: [live.id] })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });
});
