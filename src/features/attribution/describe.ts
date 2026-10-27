import type { Touch } from "@/db/schema/crm";

/**
 * Touches in words for the lead page (09 §2 "At lead creation"): "First came from Google Ads
 * (campaign marina-2bed) 12 days ago; converted after Instagram ad (offplan-oct) on a property
 * page." Pure.
 */

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const hostOf = (referrer: string | undefined): string | null => {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

const socialNames: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)pinterest\./, "Pinterest"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)snapchat\.com$/, "Snapchat"],
  [/(^|\.)threads\.net$/, "Threads"],
  [/(^|\.)t\.me$/, "Telegram"],
];

const sourceNames: Record<string, string> = {
  google: "Google",
  bing: "Bing",
  facebook: "Facebook",
  fb: "Facebook",
  instagram: "Instagram",
  ig: "Instagram",
  meta: "Meta",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
  twitter: "X",
  snapchat: "Snapchat",
};

const named = (source: string | undefined) =>
  source ? (sourceNames[source.toLowerCase()] ?? cap(source)) : null;

/** "Google Ads", "Instagram ad", "Google search", "Instagram", "an email", "a QR code", … */
export function touchSource(touch: Touch): string {
  const host = hostOf(touch.referrer);
  switch (touch.channel) {
    case "paid_search": {
      if (touch.msclkid || /bing|microsoft/i.test(touch.utm_source ?? "")) return "Microsoft Ads";
      if (touch.gclid || touch.gbraid || touch.wbraid || /google/i.test(touch.utm_source ?? ""))
        return "Google Ads";
      return touch.utm_source ? `${named(touch.utm_source)} ads` : "a search ad";
    }
    case "paid_social": {
      if (touch.ttclid) return "TikTok ad";
      if (touch.li_fat_id) return "LinkedIn ad";
      const name =
        named(touch.utm_source) ?? (touch.fbclid ? "Facebook" : null) ?? socialName(host);
      return name ? `${name} ad` : "a social media ad";
    }
    case "organic_search": {
      if (host) {
        const base = host.split(".")[0]!;
        return base === "duckduckgo" ? "DuckDuckGo" : `${cap(base)} search`;
      }
      return named(touch.utm_source) ? `${named(touch.utm_source)} search` : "a search engine";
    }
    case "organic_social":
      return socialName(host) ?? named(touch.utm_source) ?? "social media";
    case "email":
      return "an email";
    case "offline_qr":
      return touch.utm_source ? `a QR code (${touch.utm_source})` : "a QR code";
    case "portal":
      return named(touch.utm_source) ?? "a property portal";
    case "referral":
      return host
        ? `a link on ${host}`
        : touch.utm_source
          ? `a link from ${touch.utm_source}`
          : "a link";
    default:
      return "a direct visit";
  }
}

function socialName(host: string | null): string | null {
  if (!host) return null;
  return socialNames.find(([re]) => re.test(host))?.[1] ?? null;
}

/** Where they landed: "on a property page", "on the home page", … */
export function landingText(path: string): string {
  if (path === "/" || path === "") return "on the home page";
  if (path.startsWith("/property/")) return "on a property page";
  if (path.startsWith("/projects/")) return "on a project page";
  if (/^\/(buy|rent|off-plan)(\/|$)/.test(path)) return "on a search page";
  if (path.startsWith("/areas")) return "on an area guide";
  if (path.startsWith("/insights")) return "on a blog post";
  if (path.startsWith("/agents")) return "on an agent's page";
  if (path.startsWith("/developers")) return "on a developer's page";
  if (path.startsWith("/s/")) return "on a shortlist we sent";
  if (path.startsWith("/tools/mortgage")) return "on the mortgage calculator";
  if (path.startsWith("/tools/rental-returns")) return "on the rental return simulator";
  return `on ${path}`;
}

function daysAgo(at: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** The whole story in one or two sentences; null when they did not come through the site. */
export function attributionSentence(
  first: Touch | null,
  last: Touch | null,
  now: Date = new Date(),
): string | null {
  if (!first && !last) return null;
  const f = first ?? last!;
  const campaign = (t: Touch, word: boolean) =>
    t.utm_campaign ? ` (${word ? "campaign " : ""}${t.utm_campaign})` : "";
  const opening = `${f.channel === "direct" ? "First came" : "First came from"} ${
    f.channel === "direct" ? "directly" : touchSource(f)
  }${campaign(f, true)} ${daysAgo(f.at, now)}`;
  const same = !last || (last.at === f.at && last.channel === f.channel);
  if (same) return `${opening}, landing ${landingText(f.landing_path)}.`;
  const l = last!;
  const after =
    l.channel === "direct" ? "a direct visit" : `${touchSource(l)}${campaign(l, false)}`;
  return `${opening}; converted after ${after} ${landingText(l.landing_path)}.`;
}
