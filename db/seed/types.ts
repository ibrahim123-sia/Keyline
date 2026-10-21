import type { HideableField } from "@/db/schema/master-data";
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
    /** A built-in payment plan template key. */
    plan: string;
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
  /** Words of the home page sections. */
  home: {
    hero: { eyebrow: string; heading: string; subheading: string; floatingBadgeText: string };
    promises: Array<{ title: string; text: string; icon: string }>;
    featured: { eyebrow: string; heading: string; viewAllLabel: string };
    projects: { eyebrow: string; heading: string; viewAllLabel: string };
    areas: { eyebrow: string; heading: string };
  };
};
