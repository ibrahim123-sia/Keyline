import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { pages } from "@/db/schema/cms";
import { auditLog } from "@/db/schema/system";
import { patchSettings } from "@/features/settings/mutations";
import { loadSettings } from "@/features/settings/queries";
import { saveAnnouncement, saveFooterSettings } from "@/features/website/actions";
import { getAnnouncement, getLegalLinks } from "@/features/website/site";
import { tags } from "@/lib/cache-tags";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const bar = {
  enabled: true,
  text: "Pier Seven launches on 1 November",
  linkLabel: "See the project",
  href: "/projects/pier-seven",
  startsAt: "2026-11-01T06:00:00.000Z",
  endsAt: "2026-11-08T06:00:00.000Z",
};

describe("footer settings and the announcement bar", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    vi.mocked(updateTag).mockClear();
    await truncate("settings", "pages", "audit_log");
  });
  afterEach(() => vi.useRealTimers());

  it("saves the footer and the bar separately, audited", async () => {
    expect(await saveAnnouncement(bar)).toMatchObject({ ok: true });
    const footer = await saveFooterSettings({ text: "Homes by the sea.", legalText: "Regulated." });
    expect(footer).toEqual({
      ok: true,
      data: { text: "Homes by the sea.", legalText: "Regulated." },
    });
    expect(updateTag).toHaveBeenCalledWith(tags.settings("website"));
    // Saving the footer kept the announcement that was saved before it.
    const stored = await loadSettings("website");
    expect(stored.announcement).toEqual(bar);
    const db = await getDb();
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityType, "settings"));
    expect(audits.length).toBe(2);

    expect(await saveAnnouncement({ ...bar, href: "javascript:alert(1)" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    expect(await saveFooterSettings({ text: "x".repeat(301), legalText: "" })).toMatchObject({
      ok: false,
      code: "VALIDATION",
    });
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await saveFooterSettings({ text: "", legalText: "" })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("shows the bar only inside its dates", async () => {
    const db = await getDb();
    await patchSettings(db, "website", { announcement: bar }, { type: "admin", id: testAdmin.id });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00.000Z"));
    expect(await getAnnouncement()).toBeNull();
    vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"));
    expect(await getAnnouncement()).toEqual({
      text: bar.text,
      link: { label: "See the project", href: "/projects/pier-seven" },
    });
    vi.setSystemTime(new Date("2026-11-09T12:00:00.000Z"));
    expect(await getAnnouncement()).toBeNull();
  });

  it("links the published policy pages in the footer", async () => {
    const db = await getDb();
    const privacy = newId();
    const terms = newId();
    await db.insert(pages).values([
      { id: privacy, title: "Privacy policy", slug: "privacy", status: "published" },
      { id: terms, title: "Terms", slug: "terms", status: "draft" },
    ]);
    await patchSettings(
      db,
      "legal",
      { privacyPageId: privacy, termsPageId: terms },
      { type: "admin", id: testAdmin.id },
    );
    expect(await getLegalLinks()).toEqual([{ label: "Privacy policy", href: "/privacy" }]);
  });
});
