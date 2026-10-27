import type { PoiCategory } from "@/db/schema/master-data";
import type { BrandingSettings } from "@/features/settings/schema";
import type { LngLat } from "@/lib/geo";

/**
 * Everything the branded brochure prints (11 §4), as ready-made text: the template is a pure
 * function of this, and its hash is the brochure's version (the cache key changes exactly when
 * something printed changes). Images are site paths (/media/...), made absolute or inlined only
 * when the PDF is drawn. Client-safe types only.
 */
export const brochureKinds = ["property", "project"] as const;
export type BrochureKind = (typeof brochureKinds)[number];

export type BrochureImage = { url: string; alt: string };

export type BrochureFact = { label: string; value: string };

export type BrochurePoi = {
  /** 1, 2, 3… as numbered on the plot. */
  n: number;
  name: string;
  typeName: string;
  category: PoiCategory;
  /** "4 min drive", "650 m" or the admin's own text. */
  distanceText: string;
  distanceM: number;
  point: LngLat | null;
};

export type BrochurePlanRow = {
  label: string;
  when: string;
  percent: string;
  amount: string | null;
};

export type BrochureData = {
  kind: BrochureKind;
  id: string;
  slug: string;
  /** Listings only (projects have no reference). */
  reference: string | null;
  title: string;
  /** Address line, or developer and location for a project. */
  subtitle: string;
  /** "For sale · Apartment", "Off-plan · Under construction". */
  eyebrow: string;
  priceText: string;
  pricePerAreaText: string | null;
  /** "Reserved", "Under offer": shown on the cover when not simply available. */
  statusNote: string | null;
  facts: BrochureFact[];
  cover: BrochureImage | null;
  gallery: BrochureImage[];
  aboutTitle: string;
  descriptionHtml: string | null;
  highlights: string[];
  floorPlan: (BrochureImage & { title: string }) | null;
  unitTypes: Array<{ name: string; beds: string; size: string; price: string }>;
  facilitiesTitle: string;
  facilities: string[];
  plan: {
    label: string | null;
    rows: BrochurePlanRow[];
    total: string | null;
    notes: string | null;
  } | null;
  /** More specs, printed on page 3 when there is room (no payment plan or unit types). */
  details: BrochureFact[];
  location: {
    center: (LngLat & { approx: boolean; radiusM: number }) | null;
    areaName: string | null;
    pois: BrochurePoi[];
    distanceUnit: "km" | "mi";
  };
  contact: {
    heading: string;
    name: string;
    title: string | null;
    photo: BrochureImage | null;
    phone: string | null;
    email: string | null;
    /** wa.me link with the reference in the message, drawn as a QR code. */
    whatsappHref: string | null;
    whatsappText: string | null;
  };
  permit: { label: string; number: string } | null;
  agency: {
    name: string;
    logo: BrochureImage | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    licenceNumber: string | null;
    website: string;
  };
  /** The page on the site, absolute. */
  pageUrl: string;
  branding: {
    colors: BrandingSettings["colors"];
    fontDisplay: BrandingSettings["fontDisplay"];
    fontBody: BrandingSettings["fontBody"];
    cornerStyle: BrandingSettings["cornerStyle"];
  };
};
