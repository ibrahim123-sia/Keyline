import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { isBot } from "@/features/attribution/bots";
import { recordTrack } from "@/features/attribution/record";
import { parseVisitorCookie, VISITOR_COOKIE } from "@/features/attribution/visitor-cookie";
import { loadSettings } from "@/features/settings/queries";
import { CONSENT_COOKIE, LEGACY_CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { localDateString } from "@/lib/local-date";
import type { BrochureKind } from "./types";

export type DownloadCount = {
  kind: BrochureKind;
  id: string;
  /** The public page, for the visitor's journey. */
  path: string;
  visitorKey: string | null;
  consent: { analytics: boolean; marketing: boolean; at: string | null };
  device: string | null;
  country: string | null;
  siteHost: string;
  source: "uploaded" | "generated";
  now?: Date;
};

/**
 * One brochure download (05: `property_daily_stats.brochure_downloads`, visitor event
 * `brochure`). With the visitor cookie it goes through the site beacon's rules (the event only
 * with analytics consent, the daily counter always); without it (an emailed link opened
 * elsewhere) only the listing counter moves.
 */
export async function countBrochureDownload(db: DbOrTx, input: DownloadCount): Promise<void> {
  const now = input.now ?? new Date();
  const [general, leads] = [await loadSettings("general", db), await loadSettings("leads", db)];
  const today = localDateString(now, general.timeZone);
  if (input.visitorKey) {
    await recordTrack(db, {
      visitorKey: input.visitorKey,
      consent: input.consent,
      type: "brochure",
      path: input.path,
      entityType: input.kind,
      entityId: input.id,
      meta: { source: input.source },
      landing: null,
      device: input.device,
      country: input.country,
      siteHost: input.siteHost,
      portals: leads.portalInboxes.map((p) => p.portal),
      now,
      today,
    });
    return;
  }
  if (input.kind !== "property") return;
  await db.execute(sql`
    insert into property_daily_stats (property_id, date, brochure_downloads)
    select id, ${today}::date, 1 from properties
    where id = ${input.id} and agency_id = ${currentAgencyId()}
    on conflict (property_id, date)
    do update set brochure_downloads = property_daily_stats.brochure_downloads + 1`);
}

function deviceFrom(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

/** The counting details of a download request; null for bots and link previews. */
export function downloadContext(
  request: Request,
  cookies: { get(name: string): { value: string } | undefined },
): Omit<DownloadCount, "kind" | "id" | "path" | "source"> | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (isBot(ua)) return null;
  const consent = parseConsent(
    (cookies.get(CONSENT_COOKIE) ?? cookies.get(LEGACY_CONSENT_COOKIE))?.value,
  );
  return {
    visitorKey: parseVisitorCookie(cookies.get(VISITOR_COOKIE)?.value)?.key ?? null,
    consent: {
      analytics: Boolean(consent?.analytics),
      marketing: Boolean(consent?.marketing),
      at: consent ? new Date(consent.at).toISOString() : null,
    },
    device: deviceFrom(ua),
    country: request.headers.get("cf-ipcountry"),
    siteHost: new URL(request.url).host,
  };
}
