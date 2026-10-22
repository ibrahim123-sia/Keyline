import "server-only";
import type { DbOrTx } from "@/db/client";
import type { PropertyStatus } from "@/db/schema/properties";
import { enqueue } from "@/jobs/enqueue";

/**
 * Queues the alert jobs for a listing change (13 §2), inside the change's transaction so the
 * job exists exactly when the change does. Called by the properties code.
 */
export async function queueListingAlerts(
  tx: DbOrTx,
  change:
    | { kind: "live"; propertyId: string }
    | { kind: "status"; propertyId: string; status: PropertyStatus }
    | { kind: "price"; propertyId: string; oldPrice: number; newPrice: number; currency: string },
  now = new Date(),
): Promise<void> {
  const stamp = now.getTime();
  if (change.kind === "live")
    await enqueue(
      "alerts.new_listing",
      { propertyId: change.propertyId },
      { db: tx, dedupeKey: `alerts.new_listing:${change.propertyId}:${stamp}` },
    );
  else if (change.kind === "status") {
    if (change.status === "reserved" || change.status === "sold" || change.status === "rented")
      await enqueue(
        "alerts.status_change",
        { propertyId: change.propertyId, status: change.status },
        {
          db: tx,
          dedupeKey: `alerts.status_change:${change.propertyId}:${change.status}:${stamp}`,
        },
      );
  } else if (change.newPrice < change.oldPrice)
    await enqueue(
      "alerts.price_drop",
      {
        propertyId: change.propertyId,
        oldPrice: change.oldPrice,
        newPrice: change.newPrice,
        currency: change.currency,
      },
      { db: tx, dedupeKey: `alerts.price_drop:${change.propertyId}:${change.newPrice}` },
    );
}
