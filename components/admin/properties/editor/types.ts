import type { PropertyStatus } from "@/db/schema/properties";
import type { MediaItem } from "@/features/media/queries";
import type { EditorActivity, EditorOptions } from "@/features/properties/editor-data";
import type { PropertyInput } from "@/features/properties/schema";
import type { CurrencyFormat } from "@/lib/money";
import type { AreaUnit, DistanceUnit } from "@/lib/units";

/** Settings the editor needs from Market, General and Integrations (server-loaded). */
export type EditorMarket = {
  baseCurrency: string;
  currencies: Record<string, CurrencyFormat>;
  areaUnit: AreaUnit;
  distanceUnit: DistanceUnit;
  permit: { enabled: boolean; label: string; requiredOnPublish: boolean };
  rentPaymentOptions: number[];
  furnishingOptions: string[];
  ownershipTypes: string[];
  mapCenter: { lng: number; lat: number };
  mapZoom: number;
  styleUrl: string;
  siteName: string;
  /** Settings -> SEO title pattern for this kind of page, and the site title template. */
  titlePattern?: string;
  titleTemplate?: string;
};

export type SectionProps = {
  data: PropertyInput;
  set: (patch: Partial<PropertyInput>) => void;
  errorFor: (field: string) => string | undefined;
  options: EditorOptions;
  market: EditorMarket;
  media: Record<string, MediaItem>;
  rememberMedia: (items: MediaItem[]) => void;
  activity: EditorActivity;
  status: PropertyStatus;
  readOnly: boolean;
  /** Fields the chosen property type hides. */
  hidden: ReadonlySet<string>;
};
