import type { Touch } from "@/db/schema/crm";

/**
 * Attribution (09 §2): where a visit came from (a "touch"), and how a visitor's first and last
 * touch change. Pure and client-safe: the tracking endpoint and the unit tests use it.
 */

export const campaignParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
] as const;
type CampaignParam = (typeof campaignParams)[number];
export type CampaignData = Partial<Record<CampaignParam, string>>;

const utmParams = campaignParams.slice(0, 5);
const searchClickIds = ["gclid", "gbraid", "wbraid", "msclkid"] as const;
const socialClickIds = ["fbclid", "ttclid", "li_fat_id"] as const;
const paidMediums = new Set(["cpc", "ppc", "paid", "paid_search", "paid_social", "paidsocial"]);
const socialMediums = new Set(["social", "social_media", "social-media", "organic_social", "sm"]);

const host = (patterns: string[]) => patterns.map((p) => new RegExp(`(^|\\.)${p}$`));
const searchEngines = [
  // google.com, google.co.uk (not docs.google.com and the like)
  /^google\.[a-z.]+$/,
  /(^|\.)yahoo\.[a-z.]+$/,
  /(^|\.)yandex\.[a-z.]+$/,
  ...host([
    "bing\\.com",
    "duckduckgo\\.com",
    "baidu\\.com",
    "ecosia\\.org",
    "search\\.brave\\.com",
    "naver\\.com",
    "startpage\\.com",
    "qwant\\.com",
    "ask\\.com",
  ]),
];
const webmail = host([
  "mail\\.google\\.com",
  "outlook\\.live\\.com",
  "outlook\\.office\\.com",
  "mail\\.yahoo\\.com",
]);
const socialSites = [
  /(^|\.)pinterest\.[a-z.]+$/,
  ...host([
    "facebook\\.com",
    "fb\\.com",
    "fb\\.me",
    "instagram\\.com",
    "t\\.co",
    "twitter\\.com",
    "x\\.com",
    "linkedin\\.com",
    "lnkd\\.in",
    "tiktok\\.com",
    "youtube\\.com",
    "youtu\\.be",
    "reddit\\.com",
    "snapchat\\.com",
    "threads\\.net",
    "whatsapp\\.com",
    "wa\\.me",
    "t\\.me",
  ]),
];
const socialSources = new Set([
  "facebook",
  "fb",
  "instagram",
  "ig",
  "meta",
  "tiktok",
  "linkedin",
  "twitter",
  "x",
  "youtube",
  "pinterest",
  "snapchat",
  "reddit",
  "threads",
]);

const matches = (list: RegExp[], value: string) => list.some((re) => re.test(value));

/** The campaign data in a query string, trimmed, without empty values. */
export function campaignData(search: string | URLSearchParams): CampaignData {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const data: CampaignData = {};
  for (const key of campaignParams) {
    const value = params.get(key)?.trim().slice(0, 200);
    if (value) data[key] = value;
  }
  return data;
}

/** The referrer's host, or null when there is none or it is this site. */
export function externalReferrerHost(
  referrer: string | null | undefined,
  siteHost: string,
): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const h = url.hostname.toLowerCase().replace(/^www\./, "");
    const own = siteHost
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/:\d+$/, "");
    return h === own ? null : h;
  } catch {
    return null;
  }
}

/**
 * The channel, in the order 09 §2 gives: a click id or a paid medium is paid; a search engine
 * or social site with no UTM data is organic; then email, QR, portal; any other referrer is a
 * referral; nothing at all is direct. Campaign links with an unknown medium and no referrer
 * count as referrals (they still carry their campaign).
 */
export function channelFor(
  data: CampaignData,
  referrerHost: string | null,
  portals: readonly string[] = [],
): Touch["channel"] {
  const medium = data.utm_medium?.toLowerCase();
  const source = data.utm_source?.toLowerCase();
  const hasUtm = utmParams.some((k) => data[k]);
  const socialSource = source ? socialSources.has(source) || matches(socialSites, source) : false;

  if (searchClickIds.some((k) => data[k])) return "paid_search";
  if (socialClickIds.some((k) => data[k])) return "paid_social";
  if (medium && paidMediums.has(medium))
    return medium.includes("social") || socialSource ? "paid_social" : "paid_search";
  if (!hasUtm && referrerHost) {
    if (matches(webmail, referrerHost)) return "email";
    if (matches(searchEngines, referrerHost)) return "organic_search";
    if (matches(socialSites, referrerHost)) return "organic_social";
  }
  if (medium === "email" || medium === "newsletter") return "email";
  if (medium === "qr") return "offline_qr";
  // "Property Finder" in settings matches utm_source=propertyfinder or property-finder.
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (source && portals.some((p) => compact(p) === compact(source))) return "portal";
  if (medium && socialMediums.has(medium)) return "organic_social";
  if (medium === "organic") return "organic_search";
  if (referrerHost || hasUtm) return "referral";
  return "direct";
}

export type LandingInput = {
  /** The landing URL's query string. */
  search: string;
  /** `document.referrer` on the landing page. */
  referrer: string | null | undefined;
  landingPath: string;
  /** This site's host: a referrer from it is not external. */
  siteHost: string;
  /** Portal names (Settings -> Leads portal inboxes). */
  portals?: readonly string[];
  at: Date;
};

/** The touch for one landing (a full page load). */
export function touchFrom(input: LandingInput): Touch {
  const data = campaignData(input.search);
  const referrerHost = externalReferrerHost(input.referrer, input.siteHost);
  const touch: Touch = {
    ...data,
    landing_path: input.landingPath.slice(0, 300),
    channel: channelFor(data, referrerHost, input.portals),
    at: input.at.toISOString(),
  };
  // Keep where they came from, never its query string (it can hold personal data).
  if (referrerHost && input.referrer) {
    try {
      const url = new URL(input.referrer);
      touch.referrer = `${url.origin}${url.pathname}`.slice(0, 300);
    } catch {
      /* not a URL: externalReferrerHost already returned null */
    }
  }
  return touch;
}

/**
 * First touch is written once and never overwritten. Last touch changes on every visit with
 * campaign data or an external referrer; a direct visit never overwrites it (09 §2).
 */
export function nextTouches(
  current: { first: Touch | null; last: Touch | null },
  touch: Touch,
): { first: Touch; last: Touch } {
  return {
    first: current.first ?? touch,
    last: touch.channel !== "direct" || !current.last ? touch : current.last,
  };
}
