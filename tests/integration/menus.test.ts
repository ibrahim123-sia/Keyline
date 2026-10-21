import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { pages } from "@/db/schema/cms";
import { areaGuides, menus, postCategories } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { auditLog } from "@/db/schema/system";
import { saveMenu } from "@/features/menus/actions";
import { buildSiteMenus, loadMenus, menuTargetOptions } from "@/features/menus/queries";
import type { MenuItemInput } from "@/features/menus/schema";
import { tags } from "@/lib/cache-tags";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const link = (
  patch: Partial<MenuItemInput> & Pick<MenuItemInput, "type" | "target">,
): MenuItemInput => ({
  id: crypto.randomUUID(),
  label: "Link",
  openInNewTab: false,
  ...patch,
});

async function fixtures() {
  const db = await getDb();
  const about = newId();
  const draft = newId();
  const home = newId();
  await db.insert(pages).values([
    { id: about, title: "About us", slug: "about", status: "published" },
    { id: draft, title: "Careers", slug: "careers", status: "draft" },
    { id: home, title: "Home", slug: "home", status: "published", isHome: true },
  ]);
  const city = newId();
  const harbour = newId();
  const hills = newId();
  await db.insert(locations).values([
    { id: city, level: "city", name: "Coastal City", slug: "coastal-city" },
    { id: harbour, parentId: city, level: "area", name: "Old Harbour", slug: "old-harbour" },
    { id: hills, parentId: city, level: "area", name: "Quiet Hills", slug: "quiet-hills" },
  ]);
  await db.insert(areaGuides).values({
    locationId: harbour,
    title: "Living in Old Harbour",
    slug: "old-harbour-guide",
    status: "published",
  });
  const live = newId();
  const hidden = newId();
  await db.insert(projects).values([
    { id: live, name: "Pier Seven", slug: "pier-seven", isPublished: true },
    { id: hidden, name: "Dune Court", slug: "dune-court", isPublished: false },
  ]);
  const news = newId();
  await db.insert(postCategories).values({ id: news, name: "Market news", slug: "market-news" });
  return { about, draft, home, harbour, hills, live, hidden, news };
}

describe("menus", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    vi.mocked(updateTag).mockClear();
    await truncate(
      "menus",
      "pages",
      "area_guides",
      "post_categories",
      "projects",
      "locations",
      "audit_log",
    );
  });

  it("saves a header menu with dropdown links, audited, and refreshes the menus tag", async () => {
    const f = await fixtures();
    const res = await saveMenu({
      location: "header",
      items: [
        link({
          label: "Buy",
          type: "search",
          target: "/buy",
          children: [link({ label: "Old Harbour", type: "area", target: f.harbour })],
        }),
        link({ label: "About", type: "page", target: f.about }),
      ],
    });
    expect(res.ok).toBe(true);
    expect(updateTag).toHaveBeenCalledWith(tags.menus);
    const db = await getDb();
    const [row] = await db.select().from(menus).where(eq(menus.location, "header"));
    expect(row?.items).toHaveLength(2);
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "menu"), eq(auditLog.action, "menu.create")));
    expect(audits).toHaveLength(1);

    // A second save updates the same row and records only what changed.
    const again = await saveMenu({
      location: "header",
      items: [link({ label: "About us", type: "page", target: f.about })],
    });
    expect(again.ok).toBe(true);
    expect(await db.select().from(menus)).toHaveLength(1);
    const [update] = await db.select().from(auditLog).where(eq(auditLog.action, "menu.update"));
    expect(update?.entityId).toBe(row!.id);
  });

  it("refuses links to deleted things and dropdowns in footer columns", async () => {
    const res = await saveMenu({
      location: "header",
      items: [link({ label: "Ghost", type: "page", target: newId() })],
    });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(res.ok === false && res.fieldErrors?.["items.0.target"]).toBeTruthy();

    const footer = await saveMenu({
      location: "footer_1",
      title: "Explore",
      items: [
        link({
          label: "Buy",
          type: "search",
          target: "/buy",
          children: [link({ label: "Rent", type: "search", target: "/rent" })],
        }),
      ],
    });
    expect(footer).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(footer.ok === false && footer.fieldErrors?.["items.0.children"]).toBeTruthy();
  });

  it("read-only admins cannot save", async () => {
    adminState.user = { ...testAdmin, readOnly: true };
    const res = await saveMenu({ location: "header", items: [] });
    expect(res).toMatchObject({ ok: false, code: "READ_ONLY" });
  });

  it("resolves links for the site and leaves out what is not public", async () => {
    const f = await fixtures();
    for (const input of [
      {
        location: "header" as const,
        items: [
          link({ label: "Home", type: "page", target: f.home }),
          link({
            label: "Areas",
            type: "area",
            target: f.hills,
            children: [
              link({ label: "Old Harbour", type: "area", target: f.harbour }),
              link({ label: "Careers", type: "page", target: f.draft }),
            ],
          }),
          link({ label: "Pier Seven", type: "project", target: f.live }),
          link({ label: "Dune Court", type: "project", target: f.hidden }),
          link({ label: "News", type: "category", target: f.news, openInNewTab: true }),
        ],
      },
      {
        location: "footer_2" as const,
        title: "Company",
        items: [link({ label: "About", type: "page", target: f.about })],
      },
    ]) {
      expect((await saveMenu(input)).ok).toBe(true);
    }
    const db = await getDb();
    const site = await buildSiteMenus(db);
    expect(site.header.links).toEqual([
      { label: "Home", href: "/", newTab: false, children: [] },
      {
        label: "Areas",
        href: "/buy/quiet-hills",
        newTab: false,
        children: [
          { label: "Old Harbour", href: "/areas/old-harbour-guide", newTab: false, children: [] },
        ],
      },
      { label: "Pier Seven", href: "/projects/pier-seven", newTab: false, children: [] },
      { label: "News", href: "/insights/category/market-news", newTab: true, children: [] },
    ]);
    expect(site.footer_2).toEqual({
      title: "Company",
      links: [{ label: "About", href: "/about", newTab: false, children: [] }],
    });
    expect(site.mobile.links).toEqual([]);

    // The editor sees every location and every pick list, drafts included.
    const all = await loadMenus(db);
    expect(Object.keys(all)).toEqual(["header", "mobile", "footer_1", "footer_2", "footer_3"]);
    const options = await menuTargetOptions(db);
    expect(options.pages.find((p) => p.id === f.draft)).toMatchObject({ live: false });
    expect(options.areas.map((a) => a.name)).toEqual([
      "Coastal City",
      "Old Harbour",
      "Quiet Hills",
    ]);
    expect(options.projects.find((p) => p.id === f.hidden)).toMatchObject({ live: false });
  });
});
