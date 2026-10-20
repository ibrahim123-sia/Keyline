import { getMapsProvider, MapsNotConfiguredError } from "@/features/integrations/google-maps";
import type { LngLat } from "@/lib/geo";

/** Address -> point for admin pin pickers. Errors are returned as messages, not thrown. */
export async function geocode(
  query: string,
): Promise<{ point: LngLat; label: string } | { error: string }> {
  try {
    const provider = await getMapsProvider();
    const found = await provider.geocode(query);
    return found ?? { error: "No match. Try a fuller address, or drop the pin on the map." };
  } catch (err) {
    if (err instanceof MapsNotConfiguredError) {
      return {
        error:
          "Address search needs a Google Maps key (Settings -> Integrations). Drop the pin or paste coordinates.",
      };
    }
    console.error("[geocode]", (err as Error).message);
    return { error: "Address search is unavailable right now. Drop the pin or paste coordinates." };
  }
}
