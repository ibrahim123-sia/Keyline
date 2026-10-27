"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { syncMediaUsage } from "@/features/media/usage";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";
import { describeUsage } from "@/lib/usage-registry";
import { getAgentForAdmin } from "./queries";
import { agentInputSchema } from "./schema";
import { agentUsage } from "./usage";

function revalidate(id: string) {
  updateTag(tags.agents);
  updateTag(tags.agent(id));
}

export const saveAgent = adminAction(
  z.object({ id: z.uuid().nullable(), data: agentInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      if (data.areas.length) {
        const found = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.agencyId, currentAgencyId()), inArray(locations.id, data.areas)));
        if (found.length !== new Set(data.areas).size) {
          throw new ActionError("Some areas no longer exist.", "VALIDATION", {
            areas: ["Some of these areas were deleted. Check the list and save again."],
          });
        }
      }
      const slug = await uniqueSlug(data.slug || data.name, async (candidates) => {
        const rows = await tx
          .select({ slug: agents.slug })
          .from(agents)
          .where(
            and(
              eq(agents.agencyId, currentAgencyId()),
              inArray(agents.slug, candidates),
              id ? sql`${agents.id} <> ${id}` : sql`true`,
            ),
          );
        return new Set(rows.map((r) => r.slug));
      });
      const values = {
        name: data.name,
        slug,
        title: data.title || null,
        photoId: data.photoId,
        phone: data.phone,
        whatsapp: data.whatsapp,
        email: data.email ? data.email.toLowerCase() : null,
        languages: data.languages,
        areas: [...new Set(data.areas)],
        bio: data.bio || null,
        replyTimeText: data.replyTimeText || null,
        workingHours: data.workingHours,
        isActive: data.isActive,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        canonicalUrl: data.canonicalUrl || null,
        noindex: data.noindex,
        ogImageId: data.ogImageId,
        updatedBy: ctx.user.id,
      };

      if (id) {
        const before = await getAgentForAdmin(id, tx);
        if (!before) throw new ActionError("This agent profile no longer exists.", "NOT_FOUND");
        const [after] = await tx.update(agents).set(values).where(eq(agents.id, id)).returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "agent.update",
          entityType: "agent",
          entityId: id,
          before,
          after,
        });
        await redirectSlugChange(tx, {
          entity: "agent",
          entityId: id,
          oldSlug: before.slug,
          newSlug: slug,
          actorId: ctx.user.id,
        });
        await syncMediaUsage(tx, [
          before.photoId,
          before.ogImageId,
          after!.photoId,
          after!.ogImageId,
        ]);
        return after!;
      }
      const [{ next }] = (await tx
        .select({ next: sql<number>`coalesce(max(${agents.sortOrder}), -1)::int + 1` })
        .from(agents)
        .where(eq(agents.agencyId, currentAgencyId()))) as [{ next: number }];
      const [created] = await tx
        .insert(agents)
        .values({ ...values, sortOrder: next, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "agent.create",
        entityType: "agent",
        entityId: created!.id,
        after: created,
      });
      await syncMediaUsage(tx, [created!.photoId, created!.ogImageId]);
      return created!;
    });
    revalidate(saved.id);
    updateTag(tags.redirects);
    return { id: saved.id, slug: saved.slug };
  },
);

export const setAgentActive = adminAction(
  z.object({ id: z.uuid(), active: z.boolean() }),
  { write: true },
  async ({ id, active }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(agents)
        .set({ isActive: active, updatedBy: ctx.user.id })
        .where(and(eq(agents.id, id), eq(agents.agencyId, currentAgencyId())))
        .returning({ id: agents.id });
      if (!row) throw new ActionError("This agent profile no longer exists.", "NOT_FOUND");
      await writeAudit(tx, {
        actor: ctx.actor,
        action: active ? "agent.activate" : "agent.deactivate",
        entityType: "agent",
        entityId: id,
      });
    });
    revalidate(id);
    return { id, active };
  },
);

/** Team page order (drag to reorder). */
export const reorderAgents = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(agents)
          .set({ sortOrder: index })
          .where(and(eq(agents.id, id), eq(agents.agencyId, currentAgencyId())));
      }
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "agent.reorder",
        entityType: "agent",
        after: { order: ids },
      });
    });
    updateTag(tags.agents);
    return { count: ids.length };
  },
);

/** Safe delete: an agent with listings, leads or viewings is deactivated instead. */
export const deleteAgent = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await getAgentForAdmin(id, tx);
      if (!before) throw new ActionError("This agent profile no longer exists.", "NOT_FOUND");
      const usage = (await agentUsage(tx, [id])).get(id)!;
      if (usage.total > 0) {
        throw new ActionError(
          `Still assigned to ${describeUsage(usage)}. Turn the profile off instead, or reassign them first.`,
          "IN_USE",
        );
      }
      await tx.delete(agents).where(eq(agents.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "agent.delete",
        entityType: "agent",
        entityId: id,
        before,
      });
      await syncMediaUsage(tx, [before.photoId, before.ogImageId]);
    });
    revalidate(id);
    return { id };
  },
);
