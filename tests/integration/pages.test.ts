import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pageRevisions, pages } from "@/db/schema/cms";
import { media } from "@/db/schema/media";
import { seoRedirects } from "@/db/schema/seo";
import { auditLog, settings } from "@/db/schema/system";
import {
  createPage,
  createPagePreviewLink,
  deletePage,
  discardPageDraft,
  duplicatePage,
  publishPage,
  restorePage,
  restorePageRevision,
  savePageDraft,
  savePageSettings,
  schedulePage,
  setHomePage,
  trashPage,
  unpublishPage,
} from "@/features/cms/page-actions";
import { findPublicPage, getPreviewPage, pageRedirect } from "@/features/cms/page-public";
import { publishDuePages } from "@/features/cms/schedule";
import { mediaUsage } from "@/features/media/usage";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const doc = (...paragraphs: string[]) => ({
  type: "doc" as const,
  content: paragraphs.map((text) => ({
    type: "paragraph" as const,
    content: [{ type: "text" as const, text }],
  })),
});

function ok<T>(res: { ok: true; data: T } | { ok: false; error: string; code?: string }): T {
  if (!res.ok) throw new Error(`${res.code}: ${res.error}`);
  return res.data;
}

async function row(id: string) {
  const db = await getDb();
  const [r] = await db.select().from(pages).where(eq(pages.id, id));
  return r!;
}

const version = async (id: string) => (await row(id)).updatedAt.toISOString();

const hero = (heading: string) => ({
  id: "hero",
  type: "hero_simple",
  props: { heading, subheading: "", imageId: null, buttons: [] },
});

/** A new page with one finished section, published. */
async function publishedPage(title: string, sections: unknown[] = [hero(title)]) {
  const { id } = ok(await createPage({ title, starter: "blank" }));
  ok(await savePageDraft({ id, expectedUpdatedAt: await version(id), sections }));
  ok(await publishPage({ id, expectedUpdatedAt: await version(id) }));
  return id;
}

describe("page builder", () => {
  beforeEach(async () => {
    await truncate("pages", "page_revisions", "seo_redirects", "audit_log", "media", "settings");
  });

  it("creates a draft from a starter, with a slug from the title the site does not use", async () => {
    const { id, slug } = ok(await createPage({ title: "About us", starter: "standard" }));
    expect(slug).toBe("about-us");
    const r = await row(id);
    expect(r.status).toBe("draft");
    expect(r.sections).toEqual([]);
    // The starter's heading is the page's own title; everything else is left to the admin.
    expect(r.draftSections?.map((s) => s.type)).toEqual(["hero_simple", "text"]);
    expect(r.draftSections?.[0]?.props.heading).toBe("About us");
    // "projects" is a site route: the page gets another address.
    expect(ok(await createPage({ title: "Projects", starter: "blank" })).slug).toBe(
      "projects-page",
    );
    expect(ok(await createPage({ title: "About us", starter: "blank" })).slug).toBe("about-us-2");
  });

  it("autosaves unfinished sections and reports them; Publish refuses until they are fixed", async () => {
    const { id } = ok(await createPage({ title: "Sell with us", starter: "blank" }));
    // A heading that is too long fails the schema; an empty CTA heading is unfinished.
    const draft = ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: await version(id),
        sections: [
          { id: "hero", type: "hero_simple", props: { heading: "x".repeat(130) } },
          { id: "cta", type: "cta", props: { heading: "" } },
        ],
      }),
    );
    expect(draft.hasDraft).toBe(true);
    expect(Object.keys(draft.problems).sort()).toEqual(["cta", "hero"]);
    expect(draft.problems.hero?.["props.heading"]?.[0]).toMatch(/120/);
    expect(draft.problems.cta?.["props.heading"]).toEqual(["Add the heading."]);
    // Both are kept, so nothing typed is lost.
    expect((await row(id)).draftSections?.map((s) => s.id)).toEqual(["hero", "cta"]);

    const refused = await publishPage({ id, expectedUpdatedAt: draft.updatedAt });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.code).toBe("PUBLISH_RULES");
      expect(Object.keys(refused.fieldErrors ?? {}).sort()).toEqual([
        "sections.cta.props.heading",
        "sections.hero.props.heading",
      ]);
    }

    const fixed = ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: draft.updatedAt,
        sections: [
          hero("Sell with us"),
          { id: "cta", type: "cta", props: { heading: "Talk to us" } },
        ],
      }),
    );
    expect(fixed.problems).toEqual({});
    const pub = ok(await publishPage({ id, expectedUpdatedAt: fixed.updatedAt }));
    expect(pub).toMatchObject({ version: 2, firstPublish: true });
    const r = await row(id);
    expect(r).toMatchObject({ status: "published", draftSections: null, version: 2 });
    // Defaults are filled in when stored.
    expect(r.sections[1]).toMatchObject({
      type: "cta",
      props: { heading: "Talk to us", text: "", buttons: [] },
      style: { background: "white", spacing: "normal" },
    });
    expect((await findPublicPage("sell-with-us"))?.sections.map((s) => s.id)).toEqual([
      "hero",
      "cta",
    ]);
    const [audit] = await (
      await getDb()
    )
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "page.publish"));
    expect(audit).toMatchObject({ entityId: id, actorType: "admin" });
  });

  it("refuses a page with nothing visible, and an edit made over someone else's", async () => {
    const { id } = ok(await createPage({ title: "Empty", starter: "blank" }));
    const empty = await publishPage({ id, expectedUpdatedAt: await version(id) });
    expect(empty.ok || empty.code).toBe("PUBLISH_RULES");
    const stale = await version(id);
    ok(await savePageDraft({ id, expectedUpdatedAt: stale, sections: [hero("One")] }));
    const conflict = await savePageDraft({ id, expectedUpdatedAt: stale, sections: [] });
    expect(conflict.ok || conflict.code).toBe("CONFLICT");
    const hidden = ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: await version(id),
        sections: [{ ...hero("One"), hidden: true }],
      }),
    );
    const res = await publishPage({ id, expectedUpdatedAt: hidden.updatedAt });
    expect(res.ok || res.code).toBe("PUBLISH_RULES");
  });

  it("keeps the published version on the site while the draft changes, and can discard it", async () => {
    const id = await publishedPage("Off-plan guide");
    const draft = ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: await version(id),
        sections: [hero("Off-plan, explained")],
      }),
    );
    expect(draft.hasDraft).toBe(true);
    const live = await findPublicPage("off-plan-guide");
    expect(live?.sections[0]?.props).toMatchObject({ heading: "Off-plan guide" });
    const preview = await getPreviewPage(
      ok(await createPagePreviewLink({ id })).url.split("/preview/")[1]!,
    );
    expect(preview?.sections[0]?.props).toMatchObject({ heading: "Off-plan, explained" });
    // Saving the same sections as the live ones leaves no draft.
    const same = ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: draft.updatedAt,
        sections: (await row(id)).sections,
      }),
    );
    expect(same.hasDraft).toBe(false);
    ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: same.updatedAt,
        sections: [hero("Changed again")],
      }),
    );
    const discarded = ok(await discardPageDraft({ id, expectedUpdatedAt: await version(id) }));
    expect(discarded.sections[0]?.props.heading).toBe("Off-plan guide");
    expect((await row(id)).draftSections).toBeNull();
  });

  it("a slug change on a published page adds a 301; a never-published one moves freely", async () => {
    const draftId = ok(await createPage({ title: "Careers", starter: "blank" })).id;
    const base = {
      template: "default" as const,
      seoTitle: null,
      seoDescription: null,
      ogImageId: null,
      canonicalUrl: null,
      noindex: false,
    };
    ok(
      await savePageSettings({
        id: draftId,
        expectedUpdatedAt: await version(draftId),
        data: { ...base, title: "Careers", slug: "jobs" },
      }),
    );
    const db = await getDb();
    expect(await db.select().from(seoRedirects)).toEqual([]);

    const id = await publishedPage("About");
    const moved = ok(
      await savePageSettings({
        id,
        expectedUpdatedAt: await version(id),
        data: { ...base, title: "About us", slug: "about-us", seoTitle: "About the team" },
      }),
    );
    expect(moved).toMatchObject({ slug: "about-us", redirected: true });
    expect(await pageRedirect("about")).toEqual({ to: "/about-us", permanent: true });
    expect((await db.select().from(seoRedirects))[0]).toMatchObject({ hits: 1, isAuto: true });
    expect(await findPublicPage("about")).toBeNull();
    expect((await findPublicPage("about-us"))?.seoTitle).toBe("About the team");

    // Reserved and taken addresses are refused with a field error.
    for (const slug of ["buy", "jobs"]) {
      const res = await savePageSettings({
        id,
        expectedUpdatedAt: await version(id),
        data: { ...base, title: "About us", slug },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.fieldErrors?.slug?.[0]).toBeTruthy();
    }

    // Moving back removes the loop: /about-us -> /about, nothing from /about.
    ok(
      await savePageSettings({
        id,
        expectedUpdatedAt: await version(id),
        data: { ...base, title: "About", slug: "about" },
      }),
    );
    expect((await db.select().from(seoRedirects)).map((r) => [r.fromPath, r.toPath])).toEqual([
      ["/about-us", "/about"],
    ]);
  });

  it("keeps the last 20 revisions and restores one into the draft", async () => {
    const id = await publishedPage("History");
    for (let i = 2; i <= 22; i++) {
      ok(
        await savePageDraft({
          id,
          expectedUpdatedAt: await version(id),
          sections: [hero(`Version ${i}`)],
        }),
      );
      ok(await publishPage({ id, expectedUpdatedAt: await version(id) }));
    }
    const db = await getDb();
    const revisions = await db.select().from(pageRevisions).where(eq(pageRevisions.pageId, id));
    expect(revisions).toHaveLength(20);
    expect((await row(id)).version).toBe(23);
    const headings = revisions.map((r) => r.sections[0]?.props.heading);
    expect(headings).not.toContain("History");
    expect(headings).not.toContain("Version 2");
    const oldest = revisions.find((r) => r.sections[0]?.props.heading === "Version 3")!;
    const restored = ok(
      await restorePageRevision({
        pageId: id,
        revisionId: oldest.id,
        expectedUpdatedAt: await version(id),
      }),
    );
    expect(restored.sections[0]?.props.heading).toBe("Version 3");
    // Restoring only changes the draft; the site still shows the newest version.
    expect((await findPublicPage("history"))?.sections[0]?.props).toMatchObject({
      heading: "Version 22",
    });
  });

  it("publishes scheduled pages and scheduled changes when their time comes", async () => {
    const { id } = ok(await createPage({ title: "Spring offer", starter: "blank" }));
    ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: await version(id),
        sections: [hero("Spring offer")],
      }),
    );
    const at = new Date(Date.now() + 3_600_000);
    const scheduled = ok(
      await schedulePage({ id, expectedUpdatedAt: await version(id), publishAt: at.toISOString() }),
    );
    expect(scheduled.status).toBe("scheduled");
    const db = await getDb();
    expect(await publishDuePages(db, new Date())).toEqual({ published: 0, failed: 0 });
    expect(await findPublicPage("spring-offer")).toBeNull();
    expect(await publishDuePages(db, new Date(at.getTime() + 1000))).toEqual({
      published: 1,
      failed: 0,
    });
    expect(await row(id)).toMatchObject({ status: "published", publishAt: null, version: 2 });

    // A live page: its changes are scheduled, the page itself stays up meanwhile.
    const noChanges = await schedulePage({
      id,
      expectedUpdatedAt: await version(id),
      publishAt: at.toISOString(),
    });
    expect(noChanges.ok || noChanges.code).toBe("NOTHING_TO_SCHEDULE");
    ok(
      await savePageDraft({
        id,
        expectedUpdatedAt: await version(id),
        sections: [hero("Spring offer: last days")],
      }),
    );
    const later = new Date(Date.now() + 7_200_000);
    expect(
      ok(
        await schedulePage({
          id,
          expectedUpdatedAt: await version(id),
          publishAt: later.toISOString(),
        }),
      ).status,
    ).toBe("published");
    expect(await publishDuePages(db, new Date(later.getTime() + 1000))).toEqual({
      published: 1,
      failed: 0,
    });
    expect((await findPublicPage("spring-offer"))?.sections[0]?.props).toMatchObject({
      heading: "Spring offer: last days",
    });

    // In the past, or with unfinished sections: refused before it is scheduled.
    const past = await schedulePage({
      id,
      expectedUpdatedAt: await version(id),
      publishAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(past.ok || past.code).toBe("VALIDATION");
  });

  it("one home page, which can't go to the trash or be unpublished", async () => {
    const a = await publishedPage("Welcome");
    const b = await publishedPage("Welcome back");
    const { id: draft } = ok(await createPage({ title: "Not yet", starter: "blank" }));
    expect((await setHomePage({ id: draft })).ok).toBe(false);
    ok(await setHomePage({ id: a }));
    ok(await setHomePage({ id: b }));
    expect((await row(a)).isHome).toBe(false);
    expect((await row(b)).isHome).toBe(true);
    const trash = await trashPage({ id: b });
    expect(trash.ok || trash.code).toBe("IN_USE");
    const off = await unpublishPage({ id: b, expectedUpdatedAt: await version(b) });
    expect(off.ok || off.code).toBe("IN_USE");
    // The home page's own address leads to "/".
    expect((await findPublicPage("welcome-back"))?.isHome).toBe(true);
  });

  it("trash, restore as a draft and delete for good; policy pages in use stay", async () => {
    const id = await publishedPage("Privacy policy");
    const db = await getDb();
    await db.insert(settings).values({ group: "legal", value: { privacyPageId: id } });
    expect((await trashPage({ id })).ok).toBe(false);
    await truncate("settings");

    ok(await trashPage({ id }));
    expect(await findPublicPage("privacy-policy")).toBeNull();
    expect((await deletePage({ id: newId() })).ok).toBe(false);
    ok(await restorePage({ id }));
    expect(await row(id)).toMatchObject({ status: "draft", deletedAt: null });
    expect((await deletePage({ id })).ok).toBe(false);
    ok(await trashPage({ id }));
    ok(await deletePage({ id }));
    expect(await db.select().from(pages).where(eq(pages.id, id))).toEqual([]);
  });

  it("duplicates the working copy under a new address; images in sections count as used", async () => {
    const db = await getDb();
    const image = newId();
    await db.insert(media).values({
      id: image,
      r2Key: `2026/10/ffffffffff/team.jpg`,
      fileName: "team.jpg",
      mime: "image/jpeg",
      status: "ready",
    });
    const id = await publishedPage("Our team", [
      {
        id: "intro",
        type: "text_image",
        props: { heading: "Who we are", body: doc("Ten years in the city."), imageId: image },
      },
    ]);
    const usage = await mediaUsage(db, [image]);
    expect(usage.get(image)?.map((u) => u.label)).toEqual(["Page Our team"]);
    expect((await db.select().from(media).where(eq(media.id, image)))[0]?.usedCount).toBe(1);

    const copy = ok(await duplicatePage({ id }));
    expect(copy.slug).toBe("our-team-copy");
    const r = await row(copy.id);
    expect(r).toMatchObject({ status: "draft", isHome: false, title: "Our team (copy)" });
    expect(r.draftSections?.[0]?.props.imageId).toBe(image);
    expect((await mediaUsage(db, [image])).get(image)).toHaveLength(2);
  });

  it("preview links only open their own page, and not once it is in the trash", async () => {
    const id = await publishedPage("Contact");
    const { url, expiresAt } = ok(await createPagePreviewLink({ id }));
    const token = url.split("/preview/")[1]!;
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect((await getPreviewPage(token))?.id).toBe(id);
    expect(await getPreviewPage(`${token}x`)).toBeNull();
    expect(await getPreviewPage("nonsense")).toBeNull();
    ok(await trashPage({ id }));
    expect(await getPreviewPage(token)).toBeNull();
  });
});
