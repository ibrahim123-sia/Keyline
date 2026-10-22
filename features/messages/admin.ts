import "server-only";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { messageTemplates } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { templateDefaults, type TemplateDefault, type TemplateKey } from "./defaults";

export type ChannelState = {
  /** The built-in wording. */
  builtIn: { subject: string | null; body: string; button: string | null };
  /** The agency's own version, if any. */
  custom: { subject: string | null; body: string; isActive: boolean; updatedAt: string } | null;
};

export type TemplateRow = {
  key: TemplateKey;
  label: string;
  audience: TemplateDefault["audience"];
  variables: string[];
  email: ChannelState | null;
  whatsapp:
    | (ChannelState & { mapping: { name: string; language: string; variables: string[] } | null })
    | null;
};

/** Every message with its built-in wording, the agency's version and the WhatsApp mapping. */
export async function templatesForAdmin(db: DbOrTx): Promise<TemplateRow[]> {
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.agencyId, currentAgencyId()));
  const own = new Map(rows.map((r) => [`${r.channel}:${r.key}`, r]));
  const { whatsapp } = await loadSettings("integrations", db);
  const custom = (channel: string, key: string) => {
    const r = own.get(`${channel}:${key}`);
    return r
      ? {
          subject: r.subject,
          body: r.body,
          isActive: r.isActive,
          updatedAt: r.updatedAt.toISOString(),
        }
      : null;
  };
  return (Object.entries(templateDefaults) as Array<[TemplateKey, TemplateDefault]>).map(
    ([key, def]) => ({
      key,
      label: def.label,
      audience: def.audience,
      variables: def.variables,
      email: def.email
        ? {
            builtIn: {
              subject: def.email.subject,
              body: def.email.body,
              button: def.email.button ?? null,
            },
            custom: custom("email", key),
          }
        : null,
      whatsapp: def.whatsapp
        ? {
            builtIn: { subject: null, body: def.whatsapp.body, button: null },
            custom: custom("whatsapp", key),
            mapping: whatsapp.templates[key] ?? null,
          }
        : null,
    }),
  );
}
