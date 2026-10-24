import "server-only";
import type { Db } from "@/db/client";
import { leadEvents } from "@/db/schema/crm";
import { leadReplyAddress } from "@/features/inbox/rules";
import { captureLead } from "@/features/leads/capture";
import { sendTemplate } from "@/features/leads/process";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { ActionError } from "@/lib/actions";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { loadBrochure } from "./data";
import { signedBrochurePath } from "./links";
import type { BrochureKind } from "./types";

export type BrochureRequest = {
  kind: BrochureKind;
  id: string;
  name: string;
  email: string;
  visitorKey?: string | null;
};

/**
 * Behind the email gate (09 §1 #11): the visitor becomes a lead with source `brochure` (and the
 * listing or project as interest), and gets an email with a download link that passes the gate.
 * The same link is returned for an immediate download.
 */
export async function handleBrochureRequest(
  db: Db,
  input: BrochureRequest,
): Promise<{ leadId: string; downloadPath: string }> {
  const loaded = await loadBrochure(db, input.kind, input.id);
  if (!loaded) throw new ActionError(t.errors.gone, "NOT_FOUND");
  const { data } = loaded;

  const lead = await captureLead(db, {
    source: "brochure",
    sourceDetail: input.kind === "property" ? "listing" : "project",
    contact: { name: input.name, email: input.email, preferredContact: "email" },
    propertyId: input.kind === "property" ? input.id : null,
    projectId: input.kind === "project" ? input.id : null,
    details: { brochure: data.reference ?? data.title },
    visitorKey: input.visitorKey ?? null,
  });

  const downloadPath = await signedBrochurePath(input.kind, input.id);
  const url = siteUrl(downloadPath);
  const [general, integrations] = [
    await loadSettings("general", db),
    await loadSettings("integrations", db),
  ];
  const ids = await sendTemplate(
    db,
    "brochure.link",
    [input.email],
    {
      name: input.name.split(/\s+/)[0] ?? input.name,
      title: data.reference ? `${data.title} (${data.reference})` : data.title,
      agency: general.agencyName,
      url,
    },
    url,
    // One email per request (a second brochure for the same lead is a new event).
    { type: "lead_event", id: lead.eventId },
    leadReplyAddress(lead.leadId, integrations.resend.inboundDomain),
  );
  await db.insert(leadEvents).values({
    leadId: lead.leadId,
    type: "brochure_sent",
    body: null,
    meta: {
      kind: input.kind,
      ...(input.kind === "property" ? { propertyId: input.id } : { projectId: input.id }),
      emailId: ids[0] ?? null,
    },
    actorType: "system",
    createdAt: new Date(),
  });
  return { leadId: lead.leadId, downloadPath };
}
