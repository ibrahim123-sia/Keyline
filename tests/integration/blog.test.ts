import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema/auth";
import { postCategories, postTagLinks, postTags, posts } from "@/db/schema/content";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { seoRedirects } from "@/db/schema/seo";
import { auditLog } from "@/db/schema/system";
import { deleteAgent } from "@/features/agents/actions";
import {
  createPost,
  deleteCategory,
  deletePost,
  deleteTags,
  renameTag,
  reorderCategories,
  saveCategory,
  savePost,
  setPostPublishing,
} from "@/features/blog/actions";
import { loadPost } from "@/features/blog/load";
import { listPosts, listTags } from "@/features/blog/queries";
import { emptyCategory, type PostInput } from "@/features/blog/schema";
import { publishDueContent } from "@/features/content/schedule";
import { mediaUsage } from "@/features/media/usage";
import { newId } from "@/lib/ids";
import type { PostDoc } from "@/lib/rich-text-post";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const ids = { image: newId(), pdf: newId(), home: newId(), agent: newId() };

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const richBody = (): PostDoc => ({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Service charges" }] },
    { type: "paragraph", content: [{ type: "text", text: words(440) }] },
    { type: "image", attrs: { mediaId: ids.image, alt: null, caption: "The lobby", src: null } },
    { type: "propertyCard", attrs: { propertyId: ids.home, label: null } },
  ],
});

async function setup() {
  const db = await getDb();
  await db
    .insert(users)
    .values({ id: testAdmin.id, name: testAdmin.name, email: testAdmin.email, role: "admin" });
  await db.insert(media).values([
    {
      id: ids.image,
      r2Key: "2026/10/blogimage1/lobby.jpg",
      fileName: "lobby.jpg",
      mime: "image/jpeg",
      status: "ready",
      width: 1600,
      height: 1000,
      alt: "Lobby with a reception desk",
    },
    {
      id: ids.pdf,
      r2Key: "2026/10/blogpdf001/fees.pdf",
      fileName: "fees.pdf",
      mime: "application/pdf",
      status: "ready",
    },
  ]);
  await db.insert(properties).values({
    id: ids.home,
    reference: "HD-0101",
    title: "Two bed with a sea view",
    slug: "two-bed-sea-view",
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    currency: "AED",
  });
  await db.insert(agents).values({ id: ids.agent, name: "Sara Khan", slug: "sara-khan" });
  return db;
}

async function newPost(title = "What service charges cover") {
  const res = await createPost({ title });
  if (!res.ok) throw new Error(res.error);
  const db = await getDb();
  const loaded = (await loadPost(db, res.data.id))!;
  return { id: res.data.id, input: loaded.input, version: loaded.row.updatedAt.toISOString() };
}

async function save(id: string, data: PostInput, version: string) {
  return savePost({ id, data, expectedUpdatedAt: version });
}

describe("blog posts", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "post_tag_links",
      "post_tags",
      "posts",
      "post_categories",
      "properties",
      "agents",
      "media",
      "users",
      "seo_redirects",
      "audit_log",
    );
  });

  it("starts a draft by its author that follows its title, then saves the full post", async () => {
    const db = await setup();
    const post = await newPost();
    const [created] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(created).toMatchObject({
      status: "draft",
      slug: "what-service-charges-cover",
      authorUserId: testAdmin.id,
      readingMinutes: 1,
    });

    const res = await save(
      post.id,
      {
        ...post.input,
        title: "What service charges pay for",
        excerpt: "Where the money goes.",
        coverId: ids.image,
        body: richBody(),
        tags: ["Buying", "buying ", "Fees"],
        relatedPropertyIds: [ids.home, ids.home],
      },
      post.version,
    );
    expect(res.ok && res.data).toMatchObject({
      slug: "what-service-charges-pay-for",
      readingMinutes: 2,
    });

    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row!.relatedPropertyIds).toEqual([ids.home]);
    expect(row!.readingMinutes).toBe(2);
    // The server sets the editor's labels and renders the HTML itself.
    const [, , image, card] = row!.body!.content!;
    expect(image).toMatchObject({ attrs: { src: "/media/2026/10/blogimage1/lobby.jpg" } });
    expect(card).toMatchObject({ attrs: { label: "HD-0101 · Two bed with a sea view" } });
    expect(row!.bodyHtml).toContain('alt="Lobby with a reception desk" width="1600" height="1000"');
    expect(row!.bodyHtml).toContain(
      '<p class="rt-listing"><a href="/property/two-bed-sea-view">Two bed with a sea view</a></p>',
    );

    const tagNames = await db
      .select({ name: postTags.name })
      .from(postTagLinks)
      .innerJoin(postTags, eq(postTags.id, postTagLinks.tagId))
      .where(eq(postTagLinks.postId, post.id))
      .orderBy(asc(postTags.name));
    expect(tagNames.map((t) => t.name)).toEqual(["Buying", "Fees"]);

    // Cover and the image in the text are both uses of the same file.
    const uses = (await mediaUsage(db, [ids.image])).get(ids.image)!;
    expect(uses.map((u) => u.label)).toEqual([
      "Post What service charges pay for: cover",
      "Post What service charges pay for: image in the text",
    ]);
    const [file] = await db.select().from(media).where(eq(media.id, ids.image));
    expect(file!.usedCount).toBe(2);

    const list = await listPosts(
      parseTableParams({}, { sortable: ["updated"], defaultSort: { id: "updated", desc: true } }),
      db,
    );
    expect(list.rows[0]).toMatchObject({
      title: "What service charges pay for",
      author: "Test Admin",
      status: "draft",
    });
  });

  it("refuses files and records it cannot use", async () => {
    const db = await setup();
    const post = await newPost();
    const pdfInBody = await save(
      post.id,
      {
        ...post.input,
        body: {
          type: "doc",
          content: [{ type: "image", attrs: { mediaId: ids.pdf, alt: null, caption: null } }],
        },
      },
      post.version,
    );
    expect(!pdfInBody.ok && pdfInBody.fieldErrors?.body).toEqual([
      "Only images can go in the text.",
    ]);

    const goneListing = await save(
      post.id,
      {
        ...post.input,
        body: { type: "doc", content: [{ type: "propertyCard", attrs: { propertyId: newId() } }] },
      },
      post.version,
    );
    expect(!goneListing.ok && goneListing.fieldErrors?.body?.[0]).toMatch(/deleted listing/);

    const pdfCover = await save(post.id, { ...post.input, coverId: ids.pdf }, post.version);
    expect(!pdfCover.ok && pdfCover.fieldErrors?.coverId).toEqual(["Choose an image."]);

    const twoAuthors = await save(
      post.id,
      { ...post.input, authorAgentId: ids.agent, authorUserId: testAdmin.id },
      post.version,
    );
    expect(!twoAuthors.ok && twoAuthors.fieldErrors?.authorAgentId).toEqual(["Choose one author"]);

    const stale = await save(post.id, post.input, new Date(0).toISOString());
    expect(!stale.ok && stale.code).toBe("CONFLICT");
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row!.body).toBeNull();
  });

  it("publishes only a written post and redirects its old address after a slug change", async () => {
    const db = await setup();
    const post = await newPost("Buying off plan");
    const empty = await setPostPublishing({ action: "publish", id: post.id });
    expect(!empty.ok && empty.code).toBe("PUBLISH_RULES");
    expect(!empty.ok && empty.fieldErrors?.body).toEqual(["Write the post"]);

    const filled = await save(
      post.id,
      { ...post.input, body: richBody(), authorUserId: null, authorAgentId: ids.agent },
      post.version,
    );
    if (!filled.ok) throw new Error(filled.error);
    const published = await setPostPublishing({ action: "publish", id: post.id });
    expect(published.ok && published.data.status).toBe("published");
    const [live] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(live!.publishedAt).not.toBeNull();

    const renamed = await save(
      post.id,
      {
        ...post.input,
        body: richBody(),
        authorAgentId: ids.agent,
        authorUserId: null,
        slug: "off-plan-guide",
      },
      published.ok ? published.data.updatedAt : "",
    );
    expect(renamed.ok && renamed.data.slug).toBe("off-plan-guide");
    const redirects = await db.select().from(seoRedirects);
    expect(redirects).toMatchObject([
      { fromPath: "/insights/buying-off-plan", toPath: "/insights/off-plan-guide", type: 301 },
    ]);

    // Published: the text has to stay.
    const emptied = await save(
      post.id,
      { ...post.input, body: null, slug: "off-plan-guide" },
      renamed.ok ? renamed.data.updatedAt : "",
    );
    expect(!emptied.ok && emptied.code).toBe("LIVE_RULES");

    // The agent is the byline now, so the profile cannot be deleted.
    const agentDelete = await deleteAgent({ id: ids.agent });
    expect(!agentDelete.ok && agentDelete.error).toMatch(/1 posts/);

    const deleteLive = await deletePost({ id: post.id });
    expect(!deleteLive.ok && deleteLive.code).toBe("PUBLISHED");
    await setPostPublishing({ action: "unpublish", id: post.id });
    expect((await deletePost({ id: post.id })).ok).toBe(true);
    expect(await db.select().from(posts)).toEqual([]);
    const [file] = await db.select().from(media).where(eq(media.id, ids.image));
    expect(file!.usedCount).toBe(0);
  });

  it("schedules a post and the cron publishes it once its time comes", async () => {
    const db = await setup();
    const post = await newPost("Moving in checklist");
    const filled = await save(post.id, { ...post.input, body: richBody() }, post.version);
    if (!filled.ok) throw new Error(filled.error);

    const past = await setPostPublishing({
      action: "schedule",
      id: post.id,
      publishAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(!past.ok && past.fieldErrors?.publishAt?.[0]).toMatch(/at least a minute from now/);

    const at = new Date(Date.now() + 10 * 60_000);
    const scheduled = await setPostPublishing({
      action: "schedule",
      id: post.id,
      publishAt: at.toISOString(),
    });
    expect(scheduled.ok && scheduled.data).toMatchObject({
      status: "scheduled",
      publishAt: at.toISOString(),
    });

    expect(await publishDueContent(db, new Date(at.getTime() - 60_000))).toEqual({
      posts: 0,
      guides: 0,
    });
    expect(await publishDueContent(db, new Date(at.getTime() + 30_000))).toEqual({
      posts: 1,
      guides: 0,
    });
    expect(await publishDueContent(db, new Date(at.getTime() + 90_000))).toEqual({
      posts: 0,
      guides: 0,
    });
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row).toMatchObject({ status: "published", publishAt: null });
    expect(row!.publishedAt?.toISOString()).toBe(at.toISOString());
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "post.publish"), eq(auditLog.actorType, "system")));
    expect(entry).toMatchObject({ entityId: post.id });
  });

  it("manages categories: order, a 301 when the slug changes, posts kept on delete", async () => {
    const db = await setup();
    const buying = await saveCategory({ id: null, data: { ...emptyCategory(), name: "Buying" } });
    const renting = await saveCategory({ id: null, data: { ...emptyCategory(), name: "Renting" } });
    if (!buying.ok || !renting.ok) throw new Error("category");
    expect(buying.data.slug).toBe("buying");

    await reorderCategories({ ids: [renting.data.id, buying.data.id] });
    const ordered = await db
      .select({ name: postCategories.name })
      .from(postCategories)
      .orderBy(asc(postCategories.sortOrder));
    expect(ordered.map((c) => c.name)).toEqual(["Renting", "Buying"]);

    await saveCategory({
      id: buying.data.id,
      data: { ...emptyCategory(), name: "Buying", slug: "buying-a-home" },
    });
    expect(await db.select().from(seoRedirects)).toMatchObject([
      { fromPath: "/insights/category/buying", toPath: "/insights/category/buying-a-home" },
    ]);

    const post = await newPost();
    await save(post.id, { ...post.input, categoryId: buying.data.id }, post.version);
    const removed = await deleteCategory({ id: buying.data.id });
    expect(removed.ok && removed.data).toEqual({ posts: 1 });
    const [row] = await db.select().from(posts).where(eq(posts.id, post.id));
    expect(row!.categoryId).toBeNull();
  });

  it("renames, merges and deletes tags", async () => {
    const db = await setup();
    const a = await newPost("First");
    const b = await newPost("Second");
    await save(a.id, { ...a.input, tags: ["Fees", "Taxes"] }, a.version);
    await save(b.id, { ...b.input, tags: ["Charges"] }, b.version);
    const byName = async () => new Map((await listTags(db)).map((t) => [t.name, t]));

    const fees = (await byName()).get("Fees")!;
    const renamed = await renameTag({ id: fees.id, name: "Service fees" });
    expect(renamed.ok && renamed.data.merged).toBe(false);

    // "Charges" renamed to an existing tag's name joins that tag.
    const charges = (await byName()).get("Charges")!;
    const merged = await renameTag({ id: charges.id, name: "service fees" });
    expect(merged.ok && merged.data.merged).toBe(true);
    const tags = await byName();
    expect([...tags.keys()]).toEqual(["Service fees", "Taxes"]);
    expect(tags.get("Service fees")!.posts).toBe(2);

    await deleteTags({ ids: [tags.get("Taxes")!.id] });
    expect((await listTags(db)).map((t) => t.name)).toEqual(["Service fees"]);
  });
});
