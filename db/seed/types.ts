import type { HideableField } from "@/db/schema/master-data";
import type { SeedContent } from "./content";
import type { SeedPagesCopy } from "./pages";
import type { PlanTemplate } from "@/features/payment-plans/templates";
import type { SettingsOf } from "@/features/settings/schema";

type LngLatTuple = [number, number];

export type ListingSpec = [
  purpose: "sale" | "rent",
  type: string,
  location: string,
  beds: number | null,
  baths: number | null,
  /** In the preset's area unit. */
  size: number,
  /** Major units of the base currency; null: the unit type's "from" price. */
  price: number | null,
  title: string,
  extras: {
    building?: string;
    /** Street address for houses (US-style "1408 Elm Street"); otherwise building, area. */
    address?: string;
    reducedFrom?: number;
    featured?: boolean;
    stale?: boolean;
    status?: "reserved" | "under_offer" | "sold" | "rented";
    project?: string;
    unit?: string;
  },
];

export type SeedPreset = {
  key: string;
  agencyName: string;
  logoColor: string;
  settings: {
    general: Partial<SettingsOf<"general">>;
    market: Partial<SettingsOf<"market">>;
    contact: Partial<SettingsOf<"contact">>;
    seo: Partial<SettingsOf<"seo">>;
  };
  admins: Array<{ email: string; name: string; readOnly?: boolean }>;
  propertyTypes: Array<{
    key: string;
    name: string;
    slug: string;
    category: "residential" | "commercial" | "land";
    icon: string;
    hidden: HideableField[];
    /** How the seed draws and fills it; defaults from the key (villa, townhouse, office...). */
    shape?: "apartment" | "house" | "commercial" | "shop" | "plot";
  }>;
  locations: Array<{
    key: string;
    parent?: string;
    name: string;
    slug: string;
    level: "country" | "city" | "area" | "community" | "building";
    center: LngLatTuple;
    /** Half-width and half-height of a rough boundary, in degrees. */
    span: LngLatTuple;
    description: string;
    featured?: boolean;
  }>;
  poiTypes: Array<{
    key: string;
    name: string;
    icon: string;
    category: "schools" | "health" | "shopping" | "transport" | "leisure" | "other";
    radius: number;
    mode: "drive" | "walk";
    googlePlaceType: string | null;
  }>;
  pois: Array<{ type: string; name: string; address: string; point: LngLatTuple }>;
  facilities: Array<{ name: string; icon: string; group: "building" | "unit" | "community" }>;
  badges: Array<{
    name: string;
    color: string;
    textColor: string;
    icon: string;
    autoRule: "none" | "price_reduced" | "new_listing" | "verified" | "off_plan";
    autoDays: number | null;
  }>;
  developers: Array<{
    key: string;
    name: string;
    slug: string;
    year: number;
    website: string;
    color: string;
    description: string;
  }>;
  agents: Array<{
    name: string;
    slug: string;
    title: string;
    languages: string[];
    areas: string[];
    color: string;
    bio: string;
  }>;
  projects: Array<{
    key: string;
    name: string;
    slug: string;
    developer: string;
    location: string;
    point: LngLatTuple;
    status: "announced" | "under_construction" | "completed";
    launch: string;
    handover: string;
    handoverText: string;
    progress: number;
    /** A built-in payment plan template key, or the preset's own plan. */
    plan: string | PlanTemplate;
    featured: boolean;
    highlights: string[];
    description: string[];
    units: Array<{
      name: string;
      beds: number;
      baths: number;
      sizeMin: number;
      sizeMax: number;
      priceFrom: number;
      available: number;
    }>;
  }>;
  listings: ListingSpec[];
  /** Market wording and habits on the seeded listings (fees, service charges, rooms, views). */
  listingDefaults: {
    agencyFeeSale: string;
    agencyFeeRent: string;
    /** Yearly service charge per area unit in major units, [from, spread]; null: none. */
    serviceCharge: [number, number] | null;
    /** Rent deposit as a share of the listed rent (yearly rent: 0.05; monthly: 1). */
    depositShare: number;
    /** "Maid's room" on homes with 3+ beds (a Gulf habit). */
    maidRooms: boolean;
    /** Location key -> views of listings there. */
    views: Record<string, string[]>;
  };
  /** Demo people for the CRM seed: phones in the preset's own format, and how many leads. */
  crm: { phone: (i: number) => string; leads?: number };
  /** Demo customers (16 §1) and the search each one saved. */
  customers: Array<{
    email: string;
    name: string;
    phone: string;
    search: { name: string; query: string; frequency: "instant" | "daily" | "weekly" };
  }>;
  /** Demo inbox: quick replies and conversations (written straight to the tables). */
  inbox: SeedInbox;
  /** Page builder pages and the extra home page sections. */
  pages?: SeedPagesCopy;
  /** Blog posts, area guides, FAQs and testimonials (16 §1 "Content"). */
  content?: SeedContent;
  /** Words of the home page sections. */
  home: {
    hero: { eyebrow: string; heading: string; subheading: string; floatingBadgeText: string };
    /** Hero search tabs; default buy, rent and off-plan. */
    tabs?: Array<"buy" | "rent" | "off_plan">;
    promises: Array<{ title: string; text: string; icon: string }>;
    featured: { eyebrow: string; heading: string; viewAllLabel: string };
    /** Left out: no projects section on the home page. */
    projects?: { eyebrow: string; heading: string; viewAllLabel: string };
    areas: { eyebrow: string; heading: string };
  };
  /** Header, phone and footer menus (08 §2); links point at seeded content by slug. */
  menus?: Partial<
    Record<
      "header" | "mobile" | "footer_1" | "footer_2" | "footer_3",
      { title?: string; links: SeedMenuLink[] }
    >
  >;
};

/** One menu link in a preset: a search, an address, or a page, area, project or category slug. */
export type SeedMenuLink = { label: string; newTab?: boolean; children?: SeedMenuLink[] } & (
  | { search: string }
  | { url: string }
  | { page: string }
  | { area: string }
  | { project: string }
  | { category: string }
);

/** A demo conversation line; `ago` is minutes before the seed's "now". */
export type SeedInboxLine = {
  dir: "in" | "out";
  sender: "customer" | "ai" | "admin" | "system";
  body: string;
  ago: number;
  status?: "sent" | "delivered" | "read";
  tools?: Array<{ tool: string; summary: string }>;
};

export type SeedInbox = {
  quickReplies: Array<{ title: string; body: string }>;
  conversations: Array<{
    channel: "whatsapp" | "web_chat" | "email";
    who: { name: string; email?: string; phone?: string };
    status: "ai" | "needs_human" | "human" | "closed";
    subject?: string;
    lines: SeedInboxLine[];
    /** A draft reply waiting in the approval queue (10 §1). */
    approval?: { draftReply: string; reason: string; ago: number };
  }>;
};
