import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { posts } from "@/db/schema/content";
import { contacts, conversations, leads, leadTasks, utmLinks, viewings } from "@/db/schema/crm";
import { leadStages, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { priceHistory, properties, type PropertyStatus } from "@/db/schema/properties";
import { queueListingAlerts } from "@/features/alerts/triggers";
import { postSlug, revalidatePost } from "@/features/blog/write";
import { prepareBody } from "@/features/content/body";
import { insideWindow } from "@/features/inbox/rules";
import { leadConversation, sendOutgoing } from "@/features/inbox/store";
import {
  applyLeadAgent,
  applyLeadStage,
  refreshNextTask,
  timelineActor,
} from "@/features/leads/stage";
import { renderTemplateEmail } from "@/features/messages/render";
import { queueEmail } from "@/features/notifications/email";
import { refreshAutoBadges } from "@/features/properties/badges";
import { nextPropertyReference } from "@/features/properties/reference";
import { liveStatuses } from "@/features/properties/status";
import { changeStatus } from "@/features/properties/status-change";
import { propertySlug, revalidateListings } from "@/features/properties/write";
import { loadSettings } from "@/features/settings/queries";
import { createShortlist } from "@/features/shortlists/store";
import { siteOrigin, siteUrl } from "@/features/site/url";
import { newShortCode, shortLinkPath, sitePath } from "@/features/utm/links";
import { createAdminViewing, moveViewing, setViewingStatus } from "@/features/viewings/admin";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { toMinor } from "@/lib/money";
import { renderRichText, type RichDoc } from "@/lib/rich-text";
import type { PostDoc } from "@/lib/rich-text-post";
import { areaToSqm } from "@/lib/units";
import { defineTool, type AnyAiTool } from "../tools/registry";
import { agentIdByName } from "./admin-read-tools";
import { findLocations, marketFormats } from "./lookup";

/**
 * The admin assistant's write tools (10 §3 "Act"). Calling one never changes anything: the
 * runner stores a proposal with the preview built here, and `execute` runs only when an admin
 * confirms it (features/ai/actions.ts), inside the confirm transaction, re-checking what it
 * needs. Every change is audited with actor type "ai" and the confirming admin. Each tool sits
 * behind its Settings -> AI checkbox (`action`).
 */

const uuid = z.uuid();
const reference = z.string().trim().min(2).max(40).describe("Listing reference");

/** Plain paragraphs (blank-line separated) as rich text. */
function paragraphsDoc(text: string): RichDoc {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  } as RichDoc;
}

async function listingByRef(db: DbOrTx, ref: string) {
  const [row] = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        sql`lower(${properties.reference}) = lower(${ref})`,
        isNull(properties.deletedAt),
      ),
    );
  if (!row) throw new ActionError(`There is no listing ${ref}.`, "NOT_FOUND");
  return row;
}

async function openLead(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(
      and(eq(leads.id, id), eq(leads.agencyId, currentAgencyId()), isNull(leads.mergedIntoId)),
    );
  if (!row) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, row.contactId));
  return { lead: row, contact: contact! };
}

const done = (what: string, extra: Record<string, unknown> = {}) => ({ done: what, ...extra });

/* create_task ---------------------------------------------------------------------------- */

export const createTaskTool = defineTool({
  kind: "write",
  name: "create_task",
  action: "create_task",
  description: "Propose a follow-up task on a lead (with an optional due time and agent).",
  input: z.object({
    leadId: uuid,
    title: z.string().trim().min(2).max(200),
    dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
    agent: z.string().max(80).nullable().default(null).describe("Agent name; default the lead's"),
  }),
  async preview(input, ctx) {
    const { contact, lead } = await openLead(ctx.db!, input.leadId);
    return {
      summary: `Add a task for ${contact.name}: "${input.title}"`,
      lead: contact.name,
      task: input.title,
      due: input.dueAt,
      agent: input.agent ?? "the lead's agent",
      link: `/admin/leads/${lead.id}`,
    };
  },
  async execute(input, ctx) {
    const { lead } = await openLead(ctx.db, input.leadId);
    const agentId = input.agent ? await agentIdByName(ctx.db, input.agent) : lead.agentId;
    if (input.agent && !agentId)
      throw new ActionError(`No active agent called ${input.agent}.`, "VALIDATION");
    const [task] = await ctx.db
      .insert(leadTasks)
      .values({
        leadId: lead.id,
        title: input.title,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        agentId,
        createdByKind: "ai",
        createdBy: ctx.admin.user.id,
      })
      .returning({ id: leadTasks.id });
    await refreshNextTask(ctx.db, lead.id);
    await writeAudit(ctx.db, {
      actor: ctx.auditActor,
      action: "lead.task.create",
      entityType: "lead",
      entityId: lead.id,
      after: { taskId: task!.id, title: input.title, dueAt: input.dueAt },
    });
    return done("Task added", { taskId: task!.id });
  },
});

/* update_lead ---------------------------------------------------------------------------- */

export const updateLeadTool = defineTool({
  kind: "write",
  name: "update_lead",
  action: "update_lead",
  description: "Propose moving a lead to another stage and/or assigning it to an agent.",
  input: z
    .object({
      leadId: uuid,
      stage: z.string().max(60).optional().describe("Stage name"),
      lostReason: z.string().max(120).optional().describe("Needed when the stage is a lost one"),
      agent: z.string().max(80).optional().describe("Agent name, or 'none' to unassign"),
    })
    .refine((v) => v.stage || v.agent, "Give a stage or an agent"),
  async preview(input, ctx) {
    const db = ctx.db!;
    const { contact, lead } = await openLead(db, input.leadId);
    const [current] = lead.stageId
      ? await db
          .select({ name: leadStages.name })
          .from(leadStages)
          .where(eq(leadStages.id, lead.stageId))
      : [];
    const [agent] = lead.agentId
      ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, lead.agentId))
      : [];
    return {
      summary: `Update ${contact.name}'s lead`,
      lead: contact.name,
      ...(input.stage ? { stage: { before: current?.name ?? null, after: input.stage } } : {}),
      ...(input.agent
        ? { agent: { before: agent?.name ?? "Unassigned", after: input.agent } }
        : {}),
      link: `/admin/leads/${lead.id}`,
    };
  },
  async execute(input, ctx) {
    const now = new Date();
    if (input.stage) {
      const [stage] = await ctx.db
        .select({ id: leadStages.id })
        .from(leadStages)
        .where(
          and(
            eq(leadStages.agencyId, currentAgencyId()),
            sql`lower(${leadStages.name}) = lower(${input.stage})`,
          ),
        );
      if (!stage) throw new ActionError(`There is no stage called ${input.stage}.`, "VALIDATION");
      await applyLeadStage(ctx.db, {
        leadId: input.leadId,
        stageId: stage.id,
        lostReason: input.lostReason ?? null,
        actor: ctx.auditActor,
        now,
      });
    }
    if (input.agent) {
      const agentId = input.agent === "none" ? null : await agentIdByName(ctx.db, input.agent);
      if (input.agent !== "none" && !agentId)
        throw new ActionError(`No active agent called ${input.agent}.`, "VALIDATION");
      await applyLeadAgent(ctx.db, { leadId: input.leadId, agentId, actor: ctx.auditActor, now });
    }
    return done("Lead updated");
  },
});

/* update_listing ------------------------------------------------------------------------- */

const statusValues = [
  "draft",
  "available",
  "reserved",
  "under_offer",
  "sold",
  "rented",
  "off_market",
] as const;

export const updateListingTool = defineTool({
  kind: "write",
  name: "update_listing",
  action: "update_listing",
  description:
    "Propose changing a listing's price (whole units of its currency), status, featured flag or agent.",
  input: z
    .object({
      reference,
      price: z.number().positive().optional(),
      status: z.enum(statusValues).optional(),
      featured: z.boolean().optional(),
      agent: z.string().max(80).optional().describe("Agent name, or 'none'"),
    })
    .refine(
      (v) => v.price !== undefined || v.status || v.featured !== undefined || v.agent,
      "Give at least one change",
    ),
  async preview(input, ctx) {
    const db = ctx.db!;
    const row = await listingByRef(db, input.reference);
    const f = marketFormats(await loadSettings("market", db));
    const money = (minor: number | null) =>
      minor === null ? "none" : f.money(minor, row.currency);
    const [agent] = row.agentId
      ? await db.select({ name: agents.name }).from(agents).where(eq(agents.id, row.agentId))
      : [];
    const decimals = (await loadSettings("market", db)).baseCurrency.decimals;
    return {
      summary: `Update ${row.reference}, ${row.title}`,
      ...(input.price !== undefined
        ? { price: { before: money(row.price), after: money(toMinor(input.price, decimals)) } }
        : {}),
      ...(input.status ? { status: { before: row.status, after: input.status } } : {}),
      ...(input.featured !== undefined
        ? { featured: { before: row.isFeatured, after: input.featured } }
        : {}),
      ...(input.agent ? { agent: { before: agent?.name ?? "none", after: input.agent } } : {}),
      link: `/admin/properties/${row.id}`,
    };
  },
  async execute(input, ctx) {
    const db = ctx.db;
    const row = await listingByRef(db, input.reference);
    const changes: Record<string, unknown> = {};
    if (input.price !== undefined) {
      const { baseCurrency } = await loadSettings("market", db);
      const price = toMinor(input.price, baseCurrency.decimals);
      if (price !== row.price) {
        changes.price = price;
        // Price history from the first publish on, and alerts for a drop (07 §3, 12 §3).
        if (row.publishedAt) {
          await db.insert(priceHistory).values({
            propertyId: row.id,
            oldPrice: row.price,
            newPrice: price,
            currency: row.currency,
            changedBy: ctx.admin.user.id,
          });
          if (row.price !== null)
            await queueListingAlerts(db, {
              kind: "price",
              propertyId: row.id,
              oldPrice: row.price,
              newPrice: price,
              currency: row.currency ?? "",
            });
        }
      }
    }
    if (input.featured !== undefined && input.featured !== row.isFeatured)
      changes.isFeatured = input.featured;
    if (input.agent) {
      const agentId = input.agent === "none" ? null : await agentIdByName(db, input.agent);
      if (input.agent !== "none" && !agentId)
        throw new ActionError(`No active agent called ${input.agent}.`, "VALIDATION");
      if (agentId !== row.agentId) changes.agentId = agentId;
    }
    if (Object.keys(changes).length) {
      const [after] = await db
        .update(properties)
        .set({ ...changes, updatedBy: ctx.admin.user.id })
        .where(eq(properties.id, row.id))
        .returning();
      await auditChange(db, {
        actor: ctx.auditActor,
        action: "property.update",
        entityType: "property",
        entityId: row.id,
        before: row,
        after: after!,
      });
    }
    if (input.status && input.status !== row.status) {
      const res = await changeStatus(db as Tx, {
        id: row.id,
        next: input.status as PropertyStatus,
        actor: ctx.auditActor,
        userId: ctx.admin.user.id,
      });
      if (!res.ok)
        throw new ActionError(
          `Cannot publish yet: ${res.problems.map((p) => p.message).join("; ")}`,
          "VALIDATION",
        );
    }
    await refreshAutoBadges(db, [row.id]);
    revalidateListings([row.id], [row.projectId]);
    return done("Listing updated", { link: `/admin/properties/${row.id}` });
  },
});

/* write_listing_copy --------------------------------------------------------------------- */

export const writeListingCopyTool = defineTool({
  kind: "write",
  name: "write_listing_copy",
  action: "write_listing_copy",
  description:
    "Propose a new description (plain paragraphs, from the listing's facts only), highlights or SEO title and description for a listing.",
  input: z
    .object({
      reference,
      description: z.string().trim().min(40).max(6000).optional(),
      highlights: z.array(z.string().trim().min(2).max(120)).max(8).optional(),
      seoTitle: z.string().trim().min(10).max(70).optional(),
      seoDescription: z.string().trim().min(50).max(160).optional(),
    })
    .refine(
      (v) => v.description || v.highlights || v.seoTitle || v.seoDescription,
      "Give at least one text",
    ),
  async preview(input, ctx) {
    const row = await listingByRef(ctx.db!, input.reference);
    const plain = (html: string | null) =>
      (html ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return {
      summary: `New copy for ${row.reference}, ${row.title}`,
      ...(input.description
        ? {
            description: {
              before: plain(row.descriptionHtml).slice(0, 600),
              after: input.description,
            },
          }
        : {}),
      ...(input.highlights
        ? { highlights: { before: row.highlights, after: input.highlights } }
        : {}),
      ...(input.seoTitle ? { seoTitle: { before: row.seoTitle, after: input.seoTitle } } : {}),
      ...(input.seoDescription
        ? { seoDescription: { before: row.seoDescription, after: input.seoDescription } }
        : {}),
      link: `/admin/properties/${row.id}`,
    };
  },
  async execute(input, ctx) {
    const row = await listingByRef(ctx.db, input.reference);
    const doc = input.description ? paragraphsDoc(input.description) : null;
    const [after] = await ctx.db
      .update(properties)
      .set({
        ...(doc ? { description: doc, descriptionHtml: renderRichText(doc) } : {}),
        ...(input.highlights ? { highlights: input.highlights } : {}),
        ...(input.seoTitle ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription ? { seoDescription: input.seoDescription } : {}),
        updatedBy: ctx.admin.user.id,
      })
      .where(eq(properties.id, row.id))
      .returning();
    await auditChange(ctx.db, {
      actor: ctx.auditActor,
      action: "property.update",
      entityType: "property",
      entityId: row.id,
      before: row,
      after: after!,
    });
    revalidateListings([row.id], [row.projectId]);
    return done("Copy saved", { link: `/admin/properties/${row.id}` });
  },
});

/* create_listing_draft ------------------------------------------------------------------- */

export const createListingDraftTool = defineTool({
  kind: "write",
  name: "create_listing_draft",
  action: "create_listing_draft",
  description:
    "Propose a new listing as a draft (never published) from facts the admin gave, e.g. pasted text. Leave out anything not stated.",
  input: z.object({
    title: z.string().trim().min(5).max(120),
    purpose: z.enum(["sale", "rent"]),
    completion: z.enum(["ready", "off_plan"]).default("ready"),
    type: z.string().trim().min(2).max(40).describe("Property type, e.g. apartment, villa"),
    area: z.string().trim().max(80).optional(),
    building: z.string().trim().max(120).optional(),
    beds: z.number().int().min(0).max(20).optional(),
    baths: z.number().int().min(0).max(20).optional(),
    size: z.number().positive().optional().describe("In the agency's area unit"),
    price: z.number().positive().optional().describe("Whole units of the base currency"),
    description: z.string().trim().max(6000).optional(),
  }),
  async preview(input, ctx) {
    const db = ctx.db!;
    const market = await loadSettings("market", db);
    const [loc] = input.area ? await findLocations(db, [input.area]) : [];
    return {
      summary: `New draft listing: ${input.title}`,
      purpose: input.purpose,
      type: input.type,
      area: loc?.name ?? (input.area ? `${input.area} (not found, left empty)` : null),
      beds: input.beds ?? null,
      baths: input.baths ?? null,
      size: input.size ? `${input.size} ${market.areaUnit === "sqft" ? "sq ft" : "m²"}` : null,
      price: input.price
        ? marketFormats(market).money(toMinor(input.price, market.baseCurrency.decimals))
        : null,
      description: input.description ?? null,
      note: "Created as a draft; it goes live only when someone publishes it in the editor.",
    };
  },
  async execute(input, ctx) {
    const row = await insertListingDraft(ctx.db, input, {
      actor: ctx.auditActor,
      userId: ctx.admin.user.id,
    });
    return done("Draft created", { reference: row.reference, link: `/admin/properties/${row.id}` });
  },
});

export type ListingDraftInput = {
  title: string;
  purpose: "sale" | "rent";
  completion?: "ready" | "off_plan";
  type: string;
  area?: string;
  building?: string;
  beds?: number;
  baths?: number;
  /** In the agency's area unit. */
  size?: number;
  /** Whole units of the base currency. */
  price?: number;
  description?: string;
  highlights?: string[];
};

/** A draft listing from plain facts (assistant tool and "Paste text" helper). */
export async function insertListingDraft(
  db: DbOrTx,
  input: ListingDraftInput,
  by: { actor: AuditActor; userId: string },
) {
  const want = input.type.toLowerCase().replace(/s$/, "");
  const types = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, currentAgencyId()));
  const type = types.find((t) => t.name.toLowerCase().replace(/s$/, "") === want);
  if (!type) throw new ActionError(`There is no property type called ${input.type}.`, "VALIDATION");
  const market = await loadSettings("market", db);
  const [loc] = input.area ? await findLocations(db, [input.area]) : [];
  const doc = input.description ? paragraphsDoc(input.description) : null;
  const reference = await nextPropertyReference(db);
  const [row] = await db
    .insert(properties)
    .values({
      reference,
      title: input.title,
      slug: await propertySlug(db as Tx, input.title, null),
      purpose: input.purpose,
      completion: input.completion ?? "ready",
      propertyTypeId: type.id,
      locationId: loc?.id ?? null,
      buildingName: input.building ?? null,
      beds: input.beds ?? null,
      baths: input.baths ?? null,
      size: input.size ? areaToSqm(input.size, market.areaUnit) : null,
      price: input.price ? toMinor(input.price, market.baseCurrency.decimals) : null,
      currency: market.baseCurrency.code,
      pricePeriod: input.purpose === "rent" ? market.rentPeriod : null,
      ...(doc ? { description: doc, descriptionHtml: renderRichText(doc) } : {}),
      ...(input.highlights?.length ? { highlights: input.highlights } : {}),
      source: "manual",
      createdBy: by.userId,
      updatedBy: by.userId,
    })
    .returning();
  await writeAudit(db, {
    actor: by.actor,
    action: "property.create",
    entityType: "property",
    entityId: row!.id,
    after: { reference, title: row!.title, purpose: row!.purpose, status: row!.status },
  });
  await refreshAutoBadges(db, [row!.id]);
  return row!;
}

/* draft_blog_post ------------------------------------------------------------------------ */

export const draftBlogPostTool = defineTool({
  kind: "write",
  name: "draft_blog_post",
  action: "draft_blog_post",
  description:
    "Propose a blog post as a draft (never published by the assistant): title, a short excerpt and the body as paragraphs; '## ' starts a heading.",
  input: z.object({
    title: z.string().trim().min(5).max(120),
    excerpt: z.string().trim().max(300).optional(),
    body: z.string().trim().min(100).max(20_000),
  }),
  async preview(input) {
    return {
      summary: `New blog draft: ${input.title}`,
      title: input.title,
      excerpt: input.excerpt ?? null,
      body: input.body,
      note: "Saved as a draft. A person reviews and publishes it.",
    };
  },
  async execute(input, ctx) {
    const id = await insertPostDraft(ctx.db, input, {
      actor: ctx.auditActor,
      userId: ctx.admin.user.id,
    });
    return done("Draft saved", { link: `/admin/website/blog/${id}` });
  },
});

/**
 * An AI-drafted blog post, never published (assistant tool and the blog helper). The body is
 * plain paragraphs separated by blank lines; "## " starts a heading.
 */
export async function insertPostDraft(
  db: DbOrTx,
  input: { title: string; excerpt?: string | null; body: string },
  by: { actor: AuditActor; userId: string },
): Promise<string> {
  const blocks = input.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p.startsWith("## ")
        ? {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: p.slice(3).trim() }],
          }
        : { type: "paragraph", content: [{ type: "text", text: p.replace(/\s+/g, " ") }] },
    );
  const prepared = await prepareBody(db, { type: "doc", content: blocks } as PostDoc);
  const [row] = await db
    .insert(posts)
    .values({
      title: input.title,
      slug: await postSlug(db, input.title, null),
      excerpt: input.excerpt || null,
      body: prepared.body,
      bodyHtml: prepared.bodyHtml,
      readingMinutes: prepared.readingMinutes,
      authorUserId: by.userId,
      isAiDrafted: true,
      createdBy: by.userId,
      updatedBy: by.userId,
    })
    .returning({ id: posts.id, slug: posts.slug });
  await writeAudit(db, {
    actor: by.actor,
    action: "post.create",
    entityType: "post",
    entityId: row!.id,
    after: { title: input.title, slug: row!.slug, aiDrafted: true },
  });
  revalidatePost(row!.id);
  return row!.id;
}

/* send_lead_reply ------------------------------------------------------------------------ */

export const sendLeadReplyTool = defineTool({
  kind: "write",
  name: "send_lead_reply",
  action: "send_lead_reply",
  recipients: () => 1,
  description:
    "Propose a reply to one lead on WhatsApp or email (their preferred channel unless given). The admin sees the exact text before it is sent.",
  input: z.object({
    leadId: uuid,
    text: z.string().trim().min(2).max(4000),
    channel: z.enum(["whatsapp", "email"]).optional(),
  }),
  async preview(input, ctx) {
    const { contact, lead } = await openLead(ctx.db!, input.leadId);
    const channel = input.channel ?? (await replyChannel(ctx.db!, contact));
    return {
      summary: `Send ${channel === "email" ? "an email" : "a WhatsApp message"} to ${contact.name}`,
      to: channel === "email" ? contact.email : contact.whatsapp || contact.phone,
      channel,
      message: input.text,
      link: `/admin/leads/${lead.id}`,
    };
  },
  async execute(input, ctx) {
    const now = new Date();
    const { contact } = await openLead(ctx.db, input.leadId);
    const channel = input.channel ?? (await replyChannel(ctx.db, contact, now));
    const conv = await leadConversation(ctx.db, input.leadId, now, channel);
    if (!conv)
      throw new ActionError("This lead has no phone number or email to write to.", "VALIDATION");
    const sent = await sendOutgoing(ctx.db, {
      conversationId: conv.id,
      text: input.text,
      sender: "admin",
      adminId: ctx.admin.user.id,
      now,
    });
    await writeAudit(ctx.db, {
      actor: ctx.auditActor,
      action: "conversation.reply",
      entityType: "conversation",
      entityId: conv.id,
      after: { messageId: sent.messageId, channel: conv.channel },
    });
    return done(`Sent by ${conv.channel}`, { link: `/admin/inbox?c=${conv.id}` });
  },
});

/**
 * Where a free-text reply can go now: WhatsApp while their last message is under 24 hours
 * old, otherwise email when there is an address, otherwise WhatsApp (which then explains that
 * only a template can go).
 */
async function replyChannel(
  db: DbOrTx,
  contact: typeof contacts.$inferSelect,
  now = new Date(),
): Promise<"whatsapp" | "email"> {
  const [open] = await db
    .select({ expires: conversations.waWindowExpiresAt })
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contact.id),
        eq(conversations.channel, "whatsapp"),
        ne(conversations.status, "closed"),
      ),
    )
    .orderBy(sql`${conversations.waWindowExpiresAt} desc nulls last`)
    .limit(1);
  if ((contact.whatsapp || contact.phone) && insideWindow(open?.expires, now)) return "whatsapp";
  return contact.email ? "email" : "whatsapp";
}

/* send_listings_to_lead ------------------------------------------------------------------ */

export const sendListingsToLeadTool = defineTool({
  kind: "write",
  name: "send_listings_to_lead",
  action: "send_listings_to_lead",
  recipients: () => 1,
  description:
    "Propose sending one lead a personal link with up to 12 live listings (emailed when they have an email).",
  input: z.object({
    leadId: uuid,
    references: z.array(reference).min(1).max(12),
    message: z.string().trim().max(2000).default(""),
  }),
  async preview(input, ctx) {
    const db = ctx.db!;
    const { contact } = await openLead(db, input.leadId);
    const rows = await liveByRefs(db, input.references);
    return {
      summary: `Send ${rows.length} home${rows.length === 1 ? "" : "s"} to ${contact.name}`,
      to: contact.email ?? "(no email: copy the link from the lead page)",
      listings: rows.map((r) => `${r.reference} · ${r.title}`),
      notLive: input.references.filter(
        (ref) => !rows.some((r) => r.reference.toLowerCase() === ref.toLowerCase()),
      ),
      message: input.message || null,
    };
  },
  async execute(input, ctx) {
    const db = ctx.db;
    const { lead, contact } = await openLead(db, input.leadId);
    const rows = await liveByRefs(db, input.references);
    if (!rows.length) throw new ActionError("None of these homes is listed any more.", "NOT_LIVE");
    const now = new Date();
    const list = await createShortlist(db, {
      leadId: lead.id,
      propertyIds: rows.map((r) => r.id),
      message: input.message || null,
      actor: timelineActor(ctx.auditActor),
      now,
    });
    await writeAudit(db, {
      actor: ctx.auditActor,
      action: "lead.shortlist",
      entityType: "lead",
      entityId: lead.id,
      after: { shortlistId: list.id, propertyIds: rows.map((r) => r.id) },
    });
    const url = siteUrl(`/s/${list.token}`);
    if (contact.email) {
      const general = await loadSettings("general", db);
      const mail = await renderTemplateEmail(
        db,
        "shortlist.sent",
        {
          name: contact.name.split(/\s+/)[0] ?? contact.name,
          agent: ctx.admin.user.name,
          agency: general.agencyName,
          homes: rows.length === 1 ? "1 home" : `${rows.length} homes`,
          message: input.message || null,
          url,
        },
        url,
      );
      if (mail)
        await queueEmail(
          {
            to: contact.email,
            subject: mail.subject,
            template: "shortlist.sent",
            html: mail.html,
            text: mail.text,
            replyTo: ctx.admin.user.email,
            related: { type: "lead", id: lead.id },
          },
          db,
        );
    }
    return done("Sent", { url, emailed: Boolean(contact.email) });
  },
});

async function liveByRefs(db: DbOrTx, refs: string[]) {
  const lower = [...new Set(refs.map((r) => r.toLowerCase()))];
  return db
    .select({ id: properties.id, reference: properties.reference, title: properties.title })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
        sql`lower(${properties.reference}) in ${lower}`,
      ),
    );
}

/* manage_viewing ------------------------------------------------------------------------- */

export const manageViewingTool = defineTool({
  kind: "write",
  name: "manage_viewing",
  action: "manage_viewing",
  recipients: () => 1,
  description:
    "Propose booking a viewing for a lead (listing reference and start time), or moving or cancelling an existing viewing by its id.",
  input: z
    .object({
      action: z.enum(["book", "move", "cancel"]),
      leadId: uuid.optional().describe("book: the lead"),
      reference: reference.optional().describe("book: the listing"),
      viewingId: uuid.optional().describe("move or cancel: the viewing"),
      start: z.iso.datetime({ offset: true }).optional().describe("book or move: the new time"),
      type: z.enum(["in_person", "video"]).default("in_person"),
      notes: z.string().max(1000).default(""),
    })
    .superRefine((v, c) => {
      const need = (key: keyof typeof v) =>
        v[key] === undefined && c.addIssue({ code: "custom", path: [key], message: "Required" });
      if (v.action === "book")
        ["leadId", "reference", "start"].forEach((k) => need(k as keyof typeof v));
      else need("viewingId");
      if (v.action === "move") need("start");
    }),
  async preview(input, ctx) {
    const db = ctx.db!;
    const tz = (await loadSettings("general", db)).timeZone;
    const when = (iso: string) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    if (input.action === "book") {
      const { contact } = await openLead(db, input.leadId!);
      const row = await listingByRef(db, input.reference!);
      return {
        summary: `Book a viewing of ${row.reference} for ${contact.name}`,
        when: `${when(input.start!)} (${tz})`,
        type: input.type,
        note: "The visitor gets the confirmation email with the invite.",
      };
    }
    const [v] = await db
      .select({ startsAt: viewings.startsAt, status: viewings.status })
      .from(viewings)
      .where(and(eq(viewings.id, input.viewingId!), eq(viewings.agencyId, currentAgencyId())));
    if (!v) return { summary: "This viewing no longer exists." };
    return input.action === "move"
      ? {
          summary: "Move a viewing",
          when: { before: when(v.startsAt.toISOString()), after: when(input.start!) },
          note: "The visitor is told the new time.",
        }
      : {
          summary: "Cancel a viewing",
          when: when(v.startsAt.toISOString()),
          note: "The visitor is told.",
        };
  },
  async execute(input, ctx) {
    // The viewing helpers open their own transactions: inside the confirm transaction these
    // are savepoints, so a refused change still rolls back with it.
    const db = ctx.db as unknown as Db;
    if (input.action === "book") {
      const row = await listingByRef(db, input.reference!);
      const created = await createAdminViewing(
        db,
        {
          leadId: input.leadId!,
          propertyId: row.id,
          type: input.type,
          start: new Date(input.start!),
          notes: input.notes,
          force: false,
        },
        ctx.auditActor,
      );
      return done("Viewing booked", { viewing: created });
    }
    if (input.action === "move") {
      await moveViewing(db, {
        id: input.viewingId!,
        start: new Date(input.start!),
        force: false,
        actor: ctx.auditActor,
      });
      return done("Viewing moved");
    }
    await setViewingStatus(db, {
      id: input.viewingId!,
      status: "cancelled",
      actor: ctx.auditActor,
    });
    return done("Viewing cancelled");
  },
});

/* create_utm_link ------------------------------------------------------------------------ */

export const createUtmLinkTool = defineTool({
  kind: "write",
  name: "create_utm_link",
  action: "create_utm_link",
  description:
    "Propose a campaign link (UTM tags) to a page on this site, with a short link and QR code.",
  input: z.object({
    name: z.string().trim().min(2).max(120),
    page: z.string().trim().min(1).max(500).describe("A path on this site, e.g. /buy/dubai-marina"),
    source: z.string().trim().min(1).max(80),
    medium: z.string().trim().min(1).max(80),
    campaign: z.string().trim().min(1).max(120),
    term: z.string().trim().max(120).optional(),
    content: z.string().trim().max(120).optional(),
  }),
  async preview(input) {
    const path = sitePath(input.page, siteOrigin());
    return {
      summary: `Campaign link "${input.name}"`,
      page: path ?? `${input.page} (not a page on this site: it will be refused)`,
      tags: { source: input.source, medium: input.medium, campaign: input.campaign },
    };
  },
  async execute(input, ctx) {
    const basePath = sitePath(input.page, siteOrigin());
    if (!basePath)
      throw new ActionError("Use a page on this site, for example /buy.", "VALIDATION");
    for (let attempt = 0; attempt < 5; attempt++) {
      const [created] = await ctx.db
        .insert(utmLinks)
        .values({
          name: input.name,
          baseUrl: basePath,
          utmSource: input.source,
          utmMedium: input.medium,
          utmCampaign: input.campaign,
          utmTerm: input.term || null,
          utmContent: input.content || null,
          shortCode: newShortCode(),
          createdBy: ctx.admin.user.id,
          updatedBy: ctx.admin.user.id,
        })
        .onConflictDoNothing()
        .returning();
      if (!created) continue;
      await writeAudit(ctx.db, {
        actor: ctx.auditActor,
        action: "utm_link.create",
        entityType: "utm_link",
        entityId: created.id,
        after: created,
      });
      return done("Link created", {
        shortLink: siteUrl(shortLinkPath(created.shortCode)),
        link: "/admin/campaigns",
      });
    }
    throw new ActionError("Could not make a short code. Please try again.", "CONFLICT");
  },
});

export const adminWriteTools: AnyAiTool[] = [
  createTaskTool,
  updateLeadTool,
  updateListingTool,
  writeListingCopyTool,
  createListingDraftTool,
  draftBlogPostTool,
  sendLeadReplyTool,
  sendListingsToLeadTool,
  manageViewingTool,
  createUtmLinkTool,
];
