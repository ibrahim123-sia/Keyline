import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { contacts, leads, newsletterSubscribers } from "@/db/schema/crm";
import { emailLog } from "@/db/schema/system";
import { subscribeFromFooter } from "@/features/newsletter/actions";
import {
  confirmNewsletter,
  subscribeNewsletter,
  unsubscribeNewsletter,
  unsubscribeToken,
} from "@/features/newsletter/subscribe";
import { patchSettings } from "@/features/settings/mutations";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function lastConfirmLink(): Promise<string> {
  const db = await getDb();
  const mails = await db.select().from(emailLog);
  const text = mails.filter((m) => m.template === "newsletter.confirm").at(-1)!.text ?? "";
  return text.match(/\/newsletter\/confirm\/([A-Za-z0-9_-]{32})/)![1]!;
}

describe("newsletter (05 §13)", () => {
  beforeEach(async () => {
    await truncate(
      "newsletter_subscribers",
      "contacts",
      "leads",
      "lead_events",
      "email_log",
      "job_runs",
      "rate_limits",
      "settings",
      "message_templates",
      "audit_log",
    );
    await patchSettings(await getDb(), "general", { agencyName: "Haven & Dune" }, actor);
  });

  it("double opt-in: a confirmation email, a link that works once, nothing new when confirmed", async () => {
    const db = await getDb();
    expect(await subscribeNewsletter(db, { email: " Sam@Example.com ", source: "footer" })).toBe(
      "pending",
    );
    const [mail] = await db.select().from(emailLog);
    expect(mail).toMatchObject({
      to: "sam@example.com",
      template: "newsletter.confirm",
      subject: "Please confirm your subscription to Haven & Dune",
    });
    expect(mail!.text).toMatch(/\/newsletter\/unsubscribe\?u=[0-9a-f-]{36}&t=[A-Za-z0-9_-]{32}/);
    const token = await lastConfirmLink();
    const [pending] = await db.select().from(newsletterSubscribers);
    expect(pending).toMatchObject({ confirmedAt: null, source: "footer" });
    expect(pending!.confirmTokenHash).not.toContain(token);

    expect(await confirmNewsletter(db, token)).toEqual({ email: "sam@example.com" });
    expect(await confirmNewsletter(db, token)).toBeNull();
    const [confirmed] = await db.select().from(newsletterSubscribers);
    expect(confirmed!.confirmedAt).not.toBeNull();
    expect(confirmed!.confirmTokenHash).toBeNull();

    expect(await subscribeNewsletter(db, { email: "sam@example.com", source: "page" })).toBe(
      "already",
    );
    expect(await db.select().from(emailLog)).toHaveLength(1);
    // Not a lead unless Settings -> Leads says so.
    expect(await db.select().from(leads)).toEqual([]);
  });

  it("unsubscribes with the signed link only; signing up again needs a new confirmation", async () => {
    const db = await getDb();
    await subscribeNewsletter(db, { email: "lee@example.com", source: "footer" });
    await confirmNewsletter(db, await lastConfirmLink());
    const [row] = await db.select().from(newsletterSubscribers);
    expect(await unsubscribeNewsletter(db, row!.id, "x".repeat(32))).toBeNull();
    const token = await unsubscribeToken(row!.id);
    expect(await unsubscribeNewsletter(db, row!.id, token)).toEqual({ email: "lee@example.com" });
    const [gone] = await db.select().from(newsletterSubscribers);
    expect(gone!.unsubscribedAt).not.toBeNull();

    expect(await subscribeNewsletter(db, { email: "lee@example.com", source: "page" })).toBe(
      "pending",
    );
    await confirmNewsletter(db, await lastConfirmLink());
    const [back] = await db.select().from(newsletterSubscribers);
    expect(back).toMatchObject({ unsubscribedAt: null, source: "page" });
  });

  it("a confirmed subscriber becomes a lead when the setting is on; otherwise a contact is linked", async () => {
    const db = await getDb();
    const [known] = await db
      .insert(contacts)
      .values({ name: "Known Person", email: "known@example.com" })
      .returning();
    await subscribeNewsletter(db, { email: "known@example.com", source: "footer" });
    await confirmNewsletter(db, await lastConfirmLink());
    const [linked] = await db.select().from(contacts);
    expect(linked).toMatchObject({ id: known!.id, marketingConsent: true });
    expect(await db.select().from(leads)).toEqual([]);

    await patchSettings(db, "leads", { newsletterCreatesLead: true }, actor);
    await subscribeNewsletter(db, { email: "fresh@example.com", source: "page:sell-with-us" });
    await confirmNewsletter(db, await lastConfirmLink());
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({ source: "newsletter", sourceDetail: "page:sell-with-us" });
  });

  it("the footer form: a plain form action with a honeypot and an email check", async () => {
    const db = await getDb();
    const form = (fields: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(fields)) f.set(k, v);
      return f;
    };
    const idle = { status: "idle" as const, message: "" };
    expect(await subscribeFromFooter(idle, form({ email: "nope" }))).toMatchObject({
      status: "error",
    });
    expect(
      await subscribeFromFooter(idle, form({ email: "bot@example.com", website: "x" })),
    ).toMatchObject({ status: "sent" });
    expect(await db.select().from(newsletterSubscribers)).toEqual([]);
    expect(await subscribeFromFooter(idle, form({ email: "mia@example.com" }))).toMatchObject({
      status: "sent",
    });
    expect((await db.select().from(newsletterSubscribers)).map((s) => s.email)).toEqual([
      "mia@example.com",
    ]);
  });
});
