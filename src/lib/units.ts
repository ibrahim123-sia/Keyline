/**
 * Areas are stored in m² and distances in metres; the admin and the site use the units from
 * Settings -> Market (05 §5, 04 §3). Conversions happen at the edges only.
 */
export type AreaUnit = "sqft" | "sqm";
export type DistanceUnit = "km" | "mi";

const SQM_PER_SQFT = 0.09290304;
const M_PER_MI = 1609.344;

export const areaUnitLabels: Record<AreaUnit, string> = { sqft: "sq ft", sqm: "m²" };

export const areaToSqm = (value: number, unit: AreaUnit): number =>
  unit === "sqm" ? value : value * SQM_PER_SQFT;

export const areaFromSqm = (sqm: number, unit: AreaUnit): number =>
  unit === "sqm" ? sqm : sqm / SQM_PER_SQFT;

/** Money per area: stored per m², shown per the market unit (both in minor units). */
export const perAreaFromSqm = (perSqm: number, unit: AreaUnit): number =>
  unit === "sqm" ? perSqm : perSqm * SQM_PER_SQFT;

export const perAreaToSqm = (perUnit: number, unit: AreaUnit): number =>
  unit === "sqm" ? perUnit : perUnit / SQM_PER_SQFT;

/** A value for an input box: the unit's number, at most two decimals. */
export const areaInputValue = (sqm: number | null, unit: AreaUnit): number | null =>
  sqm == null ? null : Number(areaFromSqm(sqm, unit).toFixed(2));

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** "1,200 sq ft", "111.5 m²". */
export function formatArea(sqm: number, unit: AreaUnit): string {
  const v = areaFromSqm(sqm, unit);
  return `${(unit === "sqft" ? whole : oneDecimal).format(v)} ${areaUnitLabels[unit]}`;
}

/** "850 m", "1.2 km", "0.4 mi". */
export function formatDistance(metres: number, unit: DistanceUnit): string {
  if (unit === "mi") return `${oneDecimal.format(Math.max(0.1, metres / M_PER_MI))} mi`;
  if (metres < 1000) return `${whole.format(Math.max(10, Math.round(metres / 10) * 10))} m`;
  return `${oneDecimal.format(metres / 1000)} km`;
}

/** "4 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
