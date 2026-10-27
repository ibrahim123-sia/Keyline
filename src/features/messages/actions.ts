"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { messageTemplates } from "@/db/schema/crm";
import { patchSettings } from "@/features/settings/mutations";
import { loadSettings } from "@/features/settings/queries";
import { adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { templateDefaults, type TemplateDefault } from "./defaults";
import { templateKeySchema, templateSaveSchema, whatsappMappingSchema } from "./schema";

const where = (channel: "email" | "whatsapp", key: string) =>
  and(
    eq(messageTemplates.agencyId, currentAgencyId()),
    eq(messageTemplates.channel, channel),
    eq(messageTemplates.key, key),
  );

/** Settings -> Message templates: the agency's own wording (or turned off) for one message. */
export const saveMessageTemplate = adminAction(
  templateSaveSchema,
  { write: true },
  async ({ key, channel, subject, body, isActive }, ctx) => {
    const db = await getDb();
    const def = (templateDefaults as Record<string, TemplateDefault>)[key]!;
    return db.transaction(async (tx) => {
      const [before] = await tx.select().from(messageTemplates).where(where(channel, key));
      const values = {
        name: def.label,
        subject: channel === "email" ? subject : null,
        body,
        isActive,
        updatedBy: ctx.user.id,
      };
      const [after] = before
        ? await tx
            .update(messageTemplates)
            .set(values)
            .where(eq(messageTemplates.id, before.id))
            .returning()
        : await tx
            .insert(messageTemplates)
            .values({ ...values, channel, key, createdBy: ctx.user.id })
            .returning();
      if (before)
        await auditChange(tx, {
          actor: ctx.actor,
          action: "message_template.update",
          entityType: "message_template",
          entityId: after!.id,
          before,
          after,
        });
      else
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "message_template.create",
          entityType: "message_template",
          entityId: after!.id,
          after,
        });
      return { key, channel, updatedAt: after!.updatedAt.toISOString() };
    });
  },
);

/** Back to the built-in wording (and on again). */
export const resetMessageTemplate = adminAction(
  templateKeySchema,
  { write: true },
  async ({ key, channel }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [before] = await tx.delete(messageTemplates).where(where(channel, key)).returning();
      if (before)
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "message_template.reset",
          entityType: "message_template",
          entityId: before.id,
          before,
        });
    });
    return { key, channel };
  },
);

/**
 * The approved WhatsApp template for a message outside the 24-hour window. It lives with the
 * WhatsApp settings (Settings -> Integrations), so it needs a recent sign-in like them.
 */
export const saveWhatsappMapping = adminAction(
  whatsappMappingSchema,
  { write: true, sensitive: true },
  async ({ key, name, language, variables }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const { whatsapp } = await loadSettings("integrations", tx);
      const templates = { ...whatsapp.templates };
      if (name) templates[key] = { name, language: language || "en", variables };
      else delete templates[key];
      await patchSettings(tx, "integrations", { whatsapp: { ...whatsapp, templates } }, ctx.actor);
    });
    updateTag(tags.settings("integrations"));
    return { key, mapped: Boolean(name) };
  },
);
