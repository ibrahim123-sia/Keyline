import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { captureLead, type CaptureResult } from "@/features/leads/capture";
import type { PortalLead } from "./email-parser";

/**
 * A portal lead into the pipeline (09 §1 #17): source portal with the portal's name, the
 * listing found by its reference, dedupe as usual, and "portal" as the touch's channel.
 * Leads without any way to reach them are skipped.
 */
export async function capturePortalLead(
  db: Db,
  input: { portal: string; lead: PortalLead; now?: Date; via: "email" | "csv" },
): Promise<CaptureResult | null> {
  const { lead } = input;
  if (!lead.email && !lead.phone) return null;
  const now = input.now ?? new Date();
  const [listing] = lead.reference
    ? await db
        .select({ id: properties.id })
        .from(properties)
        .where(
          and(
            eq(properties.agencyId, currentAgencyId()),
            sql`lower(${properties.reference}) = lower(${lead.reference})`,
          ),
        )
        .limit(1)
    : [];
  return captureLead(db, {
    source: "portal",
    sourceDetail: input.portal,
    contact: {
      name: lead.name ?? lead.email ?? lead.phone ?? input.portal,
      email: lead.email,
      phone: lead.phone,
    },
    propertyId: listing?.id ?? null,
    message: lead.message,
    details: { via: input.via, ...(lead.reference ? { reference: lead.reference } : {}) },
    touch: {
      utm_source: input.portal,
      utm_medium: "portal",
      landing_path: "(portal)",
      channel: "portal",
      at: now.toISOString(),
    },
    lenientPhone: true,
    now,
  });
}
