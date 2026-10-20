import { badges, facilities, poiTypes, propertyTypes } from "@/db/schema/master-data";
import type { MasterKind } from "./config";

export const masterTables = {
  "property-types": propertyTypes,
  facilities,
  badges,
  "poi-types": poiTypes,
} as const satisfies Record<MasterKind, unknown>;

export type MasterRow<K extends MasterKind> = (typeof masterTables)[K]["$inferSelect"];
export type AnyMasterRow = MasterRow<MasterKind>;

/**
 * Generic view for shared queries. Drizzle cannot type `.from()` over a union of tables, and
 * every master table has the columns used generically (id, agencyId, name, sortOrder), so the
 * facilities table type stands in for all of them. Callers cast rows back to MasterRow<K>.
 */
export function genericTable(kind: MasterKind): typeof facilities {
  return masterTables[kind] as unknown as typeof facilities;
}
