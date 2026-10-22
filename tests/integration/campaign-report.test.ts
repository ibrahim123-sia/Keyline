import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { contacts, leads, newsletterSubscribers, viewings, type Touch } from "@/db/schema/crm";
import { listSubscribers } from "@/features/newsletter/queries";
import { patchSettings } from "@/features/settings/mutations";
import { campaignReport, defaultRange } from "@/features/utm/report";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const at = "2026-10-01T10:00:00Z";
const touch = (
  source: string,
  medium: string,
  campaign: string,
  channel: Touch["channel"],
): Touch => ({
  utm_source: source,
  utm_medium: medium,
  utm_campaign: campaign,
  landing_path: "/",
  channel,
  at,
});
const google = touch("google", "cpc", "marina-2bed", "paid_search");
const insta = touch("instagram", "paid_social", "offplan-oct", "paid_social");

describe("campaign report (09 §2)", () => {
  beforeEach(async () => {
    await truncate(
      "viewings",
      "leads",
      "contacts",
      "newsletter_subscribers",
      "settings",
      "audit_log",
    );
    const db = await getDb();
    await patchSettings(db, "general", { timeZone: "Asia/Dubai" }, actor);
    await patchSettings(
      db,
      "market",
      {
        baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
        visitorCurrencies: [
          {
            code: "USD",
            symbol: "$",
            symbolPosition: "before",
            decimals: 2,
            rate: 0.25,
            isExample: false,
          },
        ],
      },
      actor,
    );
    const [c] = await db.insert(contacts).values({ name: "Someone" }).returning();
    const lead = (values: Partial<typeof leads.$inferInsert>) =>
      db
        .insert(leads)
        .values({
          contactId: c!.id,
          source: "form",
          createdAt: new Date("2026-10-05T08:00:00Z"),
          ...values,
        })
        .returning();
    // First came from Google, converted after Instagram; won for AED 1,000,000.
    const [won] = await lead({
      firstTouch: google,
      lastTouch: insta,
      status: "won",
      dealValue: 100_000_000,
      dealCurrency: "AED",
    });
    // Google both times; won in USD 100,000 = AED 400,000 at 0.25.
    await lead({
      firstTouch: google,
      lastTouch: google,
      status: "won",
      dealValue: 10_000_000,
      dealCurrency: "USD",
    });
    // Direct visitor, no campaign; and a lead with no touch at all (added by hand).
    await lead({
      firstTouch: { landing_path: "/", channel: "direct", at },
      lastTouch: { landing_path: "/", channel: "direct", at },
    });
    await lead({ source: "manual" });
    // Outside the range.
    await lead({
      firstTouch: google,
      lastTouch: google,
      createdAt: new Date("2026-06-01T08:00:00Z"),
    });
    await db.insert(viewings).values([
      {
        leadId: won!.id,
        contactId: c!.id,
        startsAt: new Date(at),
        endsAt: new Date(at),
        status: "done",
      },
      {
        leadId: won!.id,
        contactId: c!.id,
        startsAt: new Date(at),
        endsAt: new Date(at),
        status: "cancelled",
      },
    ]);
  });

  const range = { from: "2026-10-01", to: "2026-10-31" };

  it("first touch credits where people first came from", async () => {
    const { rows, total, currency } = await campaignReport(await getDb(), {
      dimension: "source",
      touch: "first",
      ...range,
    });
    expect(currency).toBe("AED");
    expect(rows).toEqual([
      { value: "google", leads: 2, viewings: 1, won: 2, dealValue: 140_000_000 },
      { value: "(none)", leads: 1, viewings: 0, won: 0, dealValue: 0 },
      { value: "(not tracked)", leads: 1, viewings: 0, won: 0, dealValue: 0 },
    ]);
    expect(total).toMatchObject({ leads: 4, viewings: 1, won: 2, dealValue: 140_000_000 });
  });

  it("last touch credits the visit before they got in touch; channels and campaigns too", async () => {
    const db = await getDb();
    const last = await campaignReport(db, { dimension: "source", touch: "last", ...range });
    expect(last.rows.map((r) => [r.value, r.leads, r.dealValue])).toEqual([
      ["(none)", 1, 0],
      ["(not tracked)", 1, 0],
      ["google", 1, 40_000_000],
      ["instagram", 1, 100_000_000],
    ]);
    const channels = await campaignReport(db, { dimension: "channel", touch: "last", ...range });
    expect(channels.rows.map((r) => r.value).sort()).toEqual([
      "(not tracked)",
      "direct",
      "paid_search",
      "paid_social",
    ]);
    const all = await campaignReport(db, {
      dimension: "campaign",
      touch: "first",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(all.rows.find((r) => r.value === "marina-2bed")?.leads).toBe(3);
  });

  it("defaults to the last 90 days; the subscriber list counts each status", async () => {
    expect(defaultRange("2026-10-22")).toEqual({ from: "2026-07-25", to: "2026-10-22" });
    const db = await getDb();
    const now = new Date();
    await db.insert(newsletterSubscribers).values([
      { email: "a@example.com", confirmedAt: now, source: "footer" },
      { email: "b@example.com", source: "footer" },
      { email: "c@example.com", confirmedAt: now, unsubscribedAt: now },
    ]);
    const list = await listSubscribers(db, { q: "", status: null, page: 1, pageSize: 50 });
    expect(list.counts).toEqual({ confirmed: 1, pending: 1, unsubscribed: 1 });
    const pending = await listSubscribers(db, { q: "", status: "pending", page: 1, pageSize: 50 });
    expect(pending.rows.map((r) => r.email)).toEqual(["b@example.com"]);
    const found = await listSubscribers(db, { q: "c@", status: null, page: 1, pageSize: 50 });
    expect(found.rows.map((r) => [r.email, r.status])).toEqual([["c@example.com", "unsubscribed"]]);
  });
});
