import { getSettings } from "@/features/settings/queries";

/**
 * Temporary home until the page builder lands (Phase 4/5): shows only settings content
 * (agency name and description), never hard-coded copy.
 */
export default async function HomePage() {
  const general = await getSettings("general");
  return (
    <section className="section-y">
      <div className="container-site max-w-3xl">
        <h1 className="text-display">{general.agencyName}</h1>
        {general.shortDescription && <p className="mt-6 text-lg">{general.shortDescription}</p>}
      </div>
    </section>
  );
}
