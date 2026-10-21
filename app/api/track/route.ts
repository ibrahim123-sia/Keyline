import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { visitorEventTypes } from "@/db/schema/crm";
import { recordTrack } from "@/features/attribution/record";
import { parseVisitorCookie, VISITOR_COOKIE } from "@/features/attribution/visitor-cookie";
import { loadSettings } from "@/features/settings/queries";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { localDateString } from "@/lib/local-date";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { clientIpFromHeaders, truncateIp } from "@/lib/request";

const scalar = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
const trackSchema = z.object({
  type: z.enum(visitorEventTypes),
  path: z.string().startsWith("/").max(500),
  entityType: z
    .enum(["property", "project", "page", "post", "area_guide", "agent", "developer"])
    .optional(),
  entityId: z.uuid().optional(),
  meta: z
    .record(z.string().max(40), scalar)
    .refine((m) => Object.keys(m).length <= 12, "Too many fields")
    .optional(),
  landing: z
    .object({ search: z.string().max(2000), referrer: z.string().max(2000).nullable() })
    .optional(),
});

/** Crawlers, link previews and lab tools are not visitors. */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headlesschrome|lighthouse|pingdom|uptime|monitor/i;

function deviceFrom(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

const done = () => new Response(null, { status: 204 });

/**
 * The site's beacon (09 §2): page views on each landing and navigation, listing views,
 * WhatsApp and call clicks. Always answers 204 so the page never waits or shows an error.
 */
export async function POST(request: Request): Promise<Response> {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua)) return done();
  const jar = await cookies();
  const visitor = parseVisitorCookie(jar.get(VISITOR_COOKIE)?.value);
  if (!visitor) return done();

  let body: unknown;
  try {
    // sendBeacon posts text/plain; fetch posts JSON. Both carry the same JSON text.
    body = JSON.parse(await request.text());
  } catch {
    return done();
  }
  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) return done();

  const db = await getDb();
  const ip = truncateIp(clientIpFromHeaders(request.headers)) ?? "unknown";
  if (!(await hit(`track:${ip}`, rateLimitRules.track, db)).allowed) return done();

  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  const [general, leadSettings] = [
    await loadSettings("general", db),
    await loadSettings("leads", db),
  ];
  const now = new Date();
  const event = parsed.data;
  await recordTrack(db, {
    visitorKey: visitor.key,
    consent: {
      analytics: Boolean(consent?.analytics),
      marketing: Boolean(consent?.marketing),
      at: consent ? new Date(consent.at).toISOString() : null,
    },
    type: event.type,
    path: event.path,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    meta: event.meta,
    landing: event.landing ?? null,
    device: deviceFrom(ua),
    country: request.headers.get("cf-ipcountry"),
    siteHost: new URL(request.url).host,
    portals: leadSettings.portalInboxes.map((p) => p.portal),
    now,
    today: localDateString(now, general.timeZone),
  });
  return done();
}
