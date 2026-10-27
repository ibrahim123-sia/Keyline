import { z } from "zod";

/**
 * UTM link builder (09 §2 "Admin tools"): a page or listing on this site plus campaign tags,
 * as a full address, a short link (/go/abc12) and a QR code. Client-safe.
 */

/** Common mediums, offered as suggestions (any value is allowed). "qr" marks offline QR codes. */
export const utmMediumSuggestions = [
  "cpc",
  "paid_social",
  "social",
  "email",
  "qr",
  "display",
  "referral",
  "affiliate",
] as const;

export const utmSourceSuggestions = [
  "google",
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "newsletter",
  "whatsapp",
  "flyer",
  "billboard",
] as const;

const tag = (label: string, max = 100) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .refine((v) => !/[\s&?#=]/.test(v), `${label}: use letters, numbers, - and _ (no spaces)`);

export const utmLinkInputSchema = z.object({
  name: z.string().trim().min(1, "Give the link a name").max(120, "Use at most 120 characters"),
  /** A path on this site ("/buy/dubai-marina") or a full address on it. */
  baseUrl: z.string().trim().min(1, "Enter the page this link opens").max(500),
  utmSource: tag("Source").pipe(
    z.string().min(1, "Enter where the link is shared, e.g. instagram"),
  ),
  utmMedium: tag("Medium").pipe(z.string().min(1, "Enter the kind of link, e.g. paid_social")),
  utmCampaign: tag("Campaign").pipe(z.string().min(1, "Enter the campaign name")),
  utmTerm: tag("Term").nullable().default(null),
  utmContent: tag("Content").nullable().default(null),
});
export type UtmLinkInput = z.input<typeof utmLinkInputSchema>;

export const emptyUtmLink = (): UtmLinkInput => ({
  name: "",
  baseUrl: "/",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  utmTerm: null,
  utmContent: null,
});

/**
 * The path on this site a base address points to, or null when it points elsewhere (a short
 * link must never send people to another site).
 */
export function sitePath(input: string, siteOrigin: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const origin = new URL(siteOrigin);
    const url =
      value.startsWith("/") && !value.startsWith("//") ? new URL(value, origin) : new URL(value);
    const sameHost = url.hostname.replace(/^www\./, "") === origin.hostname.replace(/^www\./, "");
    if (!sameHost || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

type CampaignTags = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm?: string | null;
  utmContent?: string | null;
};

/** The full address with its campaign tags (existing utm_ tags on the base are replaced). */
export function campaignUrl(siteOrigin: string, basePath: string, tags: CampaignTags): string {
  const url = new URL(basePath, siteOrigin);
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith("utm_")) url.searchParams.delete(key);
  url.searchParams.set("utm_source", tags.utmSource);
  url.searchParams.set("utm_medium", tags.utmMedium);
  url.searchParams.set("utm_campaign", tags.utmCampaign);
  if (tags.utmTerm) url.searchParams.set("utm_term", tags.utmTerm);
  if (tags.utmContent) url.searchParams.set("utm_content", tags.utmContent);
  return url.toString();
}

/** Short link codes: no look-alike letters (no 0/o, 1/l/i), five characters. */
export const SHORT_CODE = /^[a-hjkmnp-z2-9]{5}$/;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newShortCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const shortLinkPath = (code: string) => `/go/${code}`;
