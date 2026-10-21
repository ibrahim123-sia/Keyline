import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as viewBeacon } from "@/app/api/insights/view/route";
import { getDb } from "@/db/client";
import { postCategories, postTagLinks, postTags, posts } from "@/db/schema/content";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import {
  countPostView,
  getPublicPost,
  listPublicPosts,
  parseInsightsQuery,
  publicCategories,
  publicPostCards,
} from "@/features/blog/public";
import { articleJsonLd } from "@/features/content/json-ld";
import { newId } from "@/lib/ids";
import type { PostDoc } from "@/lib/rich-text-post";
import { truncate } from "../helpers/db";

const ids = {
  buying: newId(),
  renting: newId(),
  image: newId(),
  home: newId(),
  sold: newId(),
  agent: newId(),
  tag: newId(),
};

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9));
const para = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});

async function post(values: Partial<typeof posts.$inferInsert> & { title: string }) {
  const db = await getDb();
  const [row] = await db
    .insert(posts)
    .values({
      slug: values.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      status: "published",
      publishedAt: day(1),
      ...values,
    })
    .returning();
  return row!;
}

describe("public blog", () => {
  beforeEach(async () => {
    await truncate(
      "post_tag_links",
      "post_tags",
      "posts",
      "post_categories",
      "properties",
      "agents",
      "media",
      "rate_limits",
    );
    const db = await getDb();
    await db.insert(postCategories).values([
      { id: ids.buying, name: "Buying", slug: "buying", sortOrder: 1 },
      { id: ids.renting, name: "Renting", slug: "renting", sortOrder: 0 },
    ]);
    await db.insert(media).values({
      id: ids.image,
      r2Key: "2026/09/insights01/view.jpg",
      fileName: "view.jpg",
      mime: "image/jpeg",
      status: "ready",
      width: 1200,
      height: 800,
      alt: "The view from the terrace",
    });
    await db.insert(properties).values([
      {
        id: ids.home,
        reference: "HD-0201",
        title: "Garden villa",
        slug: "garden-villa",
        purpose: "sale",
        status: "available",
        publishedAt: day(1),
        currency: "AED",
      },
      {
        id: ids.sold,
        reference: "HD-0202",
        title: "Old draft",
        slug: "old-draft",
        purpose: "sale",
        status: "draft",
        currency: "AED",
      },
    ]);
    await db.insert(agents).values({
      id: ids.agent,
      name: "Omar Haddad",
      slug: "omar-haddad",
      title: "Sales consultant",
    });
    await db.insert(postTags).values({ id: ids.tag, name: "Service fees", slug: "service-fees" });
  });

  it("lists published posts only, newest first, by category, tag and words", async () => {
    const fees = await post({
      title: "What service charges cover",
      categoryId: ids.buying,
      publishedAt: day(3),
      excerpt: "Where the money goes.",
    });
    await post({ title: "Renting with pets", categoryId: ids.renting, publishedAt: day(2) });
    await post({
      title: "Choosing a mortgage",
      categoryId: ids.buying,
      publishedAt: day(1),
      bodyHtml: "<p>Fixed or variable rates.</p>",
    });
    await post({ title: "Draft thoughts", status: "draft", publishedAt: null });
    await post({
      title: "Coming soon",
      status: "scheduled",
      publishAt: day(30),
      publishedAt: null,
    });
    await post({ title: "Removed", deletedAt: day(4) });
    const db = await getDb();
    await db.insert(postTagLinks).values({ postId: fees.id, tagId: ids.tag });

    const all = await listPublicPosts(parseInsightsQuery({}));
    expect(all.cards.map((c) => c.title)).toEqual([
      "What service charges cover",
      "Renting with pets",
      "Choosing a mortgage",
    ]);
    expect(all.cards[0]).toMatchObject({
      excerpt: "Where the money goes.",
      category: { name: "Buying", slug: "buying" },
    });
    // No excerpt: the start of the text instead.
    expect(all.cards[2]!.excerpt).toBe("Fixed or variable rates.");

    const buying = await listPublicPosts(parseInsightsQuery({}, "buying"));
    expect(buying.cards.map((c) => c.title)).toEqual([
      "What service charges cover",
      "Choosing a mortgage",
    ]);
    const tagged = await listPublicPosts(parseInsightsQuery({ tag: "service-fees" }));
    expect(tagged.cards.map((c) => c.title)).toEqual(["What service charges cover"]);
    const words = await listPublicPosts(parseInsightsQuery({ q: "variable" }));
    expect(words.cards.map((c) => c.title)).toEqual(["Choosing a mortgage"]);
    // Odd input is ignored rather than trusted.
    expect(parseInsightsQuery({ tag: "<b>", page: "-4" })).toMatchObject({ tag: null, page: 1 });

    expect((await publicCategories()).map((c) => [c.name, c.posts])).toEqual([
      ["Renting", 1],
      ["Buying", 2],
    ]);
  });

  it("pages through posts twelve at a time", async () => {
    for (let i = 1; i <= 14; i++) await post({ title: `Post ${i}`, publishedAt: day(i) });
    const first = await listPublicPosts(parseInsightsQuery({}));
    expect(first).toMatchObject({ total: 14, page: 1, pages: 2 });
    expect(first.cards).toHaveLength(12);
    const second = await listPublicPosts(parseInsightsQuery({ page: "2" }));
    expect(second.cards.map((c) => c.title)).toEqual(["Post 2", "Post 1"]);
    // Past the end: the last page.
    expect((await listPublicPosts(parseInsightsQuery({ page: "9" }))).page).toBe(2);
  });

  it("loads a post with its byline, body pieces, live listing cards and related posts", async () => {
    const body: PostDoc = {
      type: "doc",
      content: [
        para("A short guide."),
        { type: "image", attrs: { mediaId: ids.image, alt: null, caption: null } },
        { type: "propertyCard", attrs: { propertyId: ids.home } },
        para("The end."),
      ],
    };
    const main = await post({
      title: "Living by the park",
      body,
      categoryId: ids.buying,
      authorAgentId: ids.agent,
      coverId: ids.image,
      readingMinutes: 4,
      relatedPropertyIds: [ids.home, ids.sold],
      publishedAt: day(5),
    });
    await post({ title: "Same category", categoryId: ids.buying, publishedAt: day(2) });
    await post({ title: "Newer, other category", categoryId: ids.renting, publishedAt: day(4) });
    await post({ title: "Unpublished", status: "draft", categoryId: ids.buying });

    const p = (await getPublicPost("living-by-the-park"))!;
    expect(p).toMatchObject({
      title: "Living by the park",
      author: { name: "Omar Haddad", href: "/agents/omar-haddad", title: "Sales consultant" },
      category: { name: "Buying", slug: "buying" },
      readingMinutes: 4,
      relatedPropertyIds: [ids.home, ids.sold],
    });
    expect(p.cover?.url).toBe("/media/2026/09/insights01/view.jpg");
    expect(p.segments.map((s) => s.kind)).toEqual(["html", "property", "html"]);
    expect(p.segments[0]).toMatchObject({ kind: "html" });
    expect((p.segments[0] as { html: string }).html).toContain('alt="The view from the terrace"');
    expect(p.related.map((r) => r.title)).toEqual(["Same category", "Newer, other category"]);

    const ld = articleJsonLd(p, {
      url: "https://agency.example/insights/living-by-the-park",
      origin: "https://agency.example",
      description: "A short guide.",
      publisher: { name: "Haven & Dune", url: "https://agency.example/", logo: null },
    });
    expect(ld).toMatchObject({
      "@type": "Article",
      headline: "Living by the park",
      datePublished: day(5).toISOString(),
      author: {
        "@type": "Person",
        name: "Omar Haddad",
        url: "https://agency.example/agents/omar-haddad",
      },
      publisher: { "@type": "Organization", name: "Haven & Dune" },
      image: ["https://agency.example/media/2026/09/insights01/view.jpg?w=1200&q=75"],
      articleSection: "Buying",
    });

    // A hidden agent profile still names the author, without a link.
    const db = await getDb();
    await db.update(agents).set({ isActive: false }).where(eq(agents.id, ids.agent));
    expect((await getPublicPost("living-by-the-park"))!.author).toMatchObject({ href: null });

    expect(await getPublicPost("unpublished")).toBeNull();
    expect((await publicPostCards([main.id, newId()])).map((c) => c.title)).toEqual([
      "Living by the park",
    ]);
  });

  it("counts views of published posts, once per visitor address in half an hour", async () => {
    const live = await post({ title: "Counted" });
    const draft = await post({ title: "Not counted", status: "draft" });
    const send = (id: string, ip: string) =>
      viewBeacon(
        new Request("http://localhost/api/insights/view", {
          method: "POST",
          body: JSON.stringify({ id }),
          headers: { "x-forwarded-for": ip },
        }) as never,
      );
    expect((await send(live.id, "203.0.113.7")).status).toBe(204);
    await send(live.id, "203.0.113.7");
    await send(live.id, "198.51.100.4");
    await send(draft.id, "203.0.113.7");
    expect((await send("not-an-id", "203.0.113.7")).status).toBe(400);

    const db = await getDb();
    const views = async (id: string) =>
      (await db.select({ n: posts.viewsCount }).from(posts).where(eq(posts.id, id)))[0]!.n;
    expect(await views(live.id)).toBe(2);
    expect(await views(draft.id)).toBe(0);
    expect(await countPostView(draft.id)).toBe(false);
  });
});
