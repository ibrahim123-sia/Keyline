import { ListingCard } from "@/components/site/listings/listing-card";
import { publicCards } from "@/features/listings/public-cards";
import { cardContext } from "@/features/site/card-context";
import type { PostSegment } from "@/lib/rich-text-post";

/**
 * A post or area guide body: the stored HTML pieces, with live listing cards between them
 * (price and status as they are today; a listing that left the market is skipped).
 */
export async function PostBody({ segments }: { segments: PostSegment[] }) {
  const ids = segments.flatMap((s) => (s.kind === "property" ? [s.propertyId] : []));
  const [cards, ctx] = ids.length
    ? await Promise.all([publicCards(ids), cardContext()])
    : [[], null];
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <div className="flex flex-col">
      {segments.map((s, i) => {
        if (s.kind === "html")
          return (
            <div
              key={i}
              className="rich-text text-[17px] leading-relaxed text-text"
              // Built on the server from the editor's allowlisted JSON (lib/rich-text-post.ts).
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          );
        const card = byId.get(s.propertyId);
        return card && ctx ? (
          <div key={i} className="my-6">
            <ListingCard listing={card} ctx={ctx} layout="row" />
          </div>
        ) : null;
      })}
    </div>
  );
}
