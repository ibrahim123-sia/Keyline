"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { utmLinks } from "@/db/schema/crm";
import { siteOrigin } from "@/features/site/url";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { newShortCode, sitePath, utmLinkInputSchema } from "./links";

/** Admin -> Campaigns: save a UTM link (09 §2). New links get a unique short code. */
export const saveUtmLink = adminAction(
  z.object({ id: z.uuid().nullable(), data: utmLinkInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const basePath = sitePath(data.baseUrl, siteOrigin());
    if (!basePath)
      throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
        baseUrl: ["Use a page on this site, for example /buy/dubai-marina or its full address"],
      });
    const values = {
      name: data.name,
      baseUrl: basePath,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      utmTerm: data.utmTerm || null,
      utmContent: data.utmContent || null,
      updatedBy: ctx.user.id,
    };
    const db = await getDb();
    return db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx
          .select()
          .from(utmLinks)
          .where(and(eq(utmLinks.id, id), eq(utmLinks.agencyId, currentAgencyId())));
        if (!before) throw new ActionError("This link no longer exists.", "NOT_FOUND");
        const [after] = await tx
          .update(utmLinks)
          .set(values)
          .where(eq(utmLinks.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "utm_link.update",
          entityType: "utm_link",
          entityId: id,
          before,
          after,
        });
        return { id, shortCode: after!.shortCode };
      }
      // Five characters from 31 give 28 million codes; retry the rare clash.
      for (let attempt = 0; attempt < 5; attempt++) {
        const [created] = await tx
          .insert(utmLinks)
          .values({ ...values, shortCode: newShortCode(), createdBy: ctx.user.id })
          .onConflictDoNothing()
          .returning();
        if (!created) continue;
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "utm_link.create",
          entityType: "utm_link",
          entityId: created.id,
          after: created,
        });
        return { id: created.id, shortCode: created.shortCode };
      }
      throw new ActionError("Could not make a short code. Please try again.", "CONFLICT");
    });
  },
);

export const deleteUtmLink = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [before] = await tx
        .delete(utmLinks)
        .where(and(eq(utmLinks.id, id), eq(utmLinks.agencyId, currentAgencyId())))
        .returning();
      if (!before) throw new ActionError("This link no longer exists.", "NOT_FOUND");
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "utm_link.delete",
        entityType: "utm_link",
        entityId: id,
        before,
      });
    });
    return { id };
  },
);
