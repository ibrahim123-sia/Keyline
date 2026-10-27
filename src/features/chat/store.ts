import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { messages, visitors } from "@/db/schema/crm";
import { findOpenConversation } from "@/features/inbox/store";
import { loadListingCards } from "@/features/listings/cards";
import { bedsLabel, currencyFormats, priceLabel } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import { formatArea } from "@/lib/units";
import type { ChatCard, ChatMessage } from "./schema";

/** The visitor behind the cookie, created if the beacon has not seen them yet. */
export async function chatVisitor(db: DbOrTx, visitorKey: string): Promise<string> {
  const where = and(eq(visitors.agencyId, currentAgencyId()), eq(visitors.visitorKey, visitorKey));
  const [found] = await db.select({ id: visitors.id }).from(visitors).where(where);
  if (found) return found.id;
  const [created] = await db
    .insert(visitors)
    .values({ visitorKey })
    .onConflictDoNothing()
    .returning({ id: visitors.id });
  if (created) return created.id;
  const [again] = await db.select({ id: visitors.id }).from(visitors).where(where);
  return again!.id;
}

/** This visitor's open web chat (its outside id is the visitor id). */
export function visitorChat(db: DbOrTx, visitorId: string) {
  return findOpenConversation(db, { channel: "web_chat", externalId: visitorId });
}

/** Messages the visitor sees: theirs and the replies, newer than `after` when given. */
export async function chatMessages(
  db: DbOrTx,
  conversationId: string,
  after?: Date | null,
): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      sender: messages.sender,
      body: messages.body,
      cards: messages.cards,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        after ? gt(messages.createdAt, after) : undefined,
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(200);
  const cards = await chatCards(db, [...new Set(rows.flatMap((m) => m.cards))]);
  return rows.map((m) => ({
    id: m.id,
    mine: m.direction === "in",
    sender: m.sender,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    cards: m.cards.map((id) => cards.get(id)).filter((c): c is ChatCard => Boolean(c)),
  }));
}

/** Listing cards for the chat, live (price and status as they are now). */
async function chatCards(db: DbOrTx, ids: string[]): Promise<Map<string, ChatCard>> {
  if (!ids.length) return new Map();
  const market = await loadSettings("market", db);
  const formats = currencyFormats(market);
  const list = await loadListingCards(db, ids);
  return new Map(
    list.map((c) => [
      c.id,
      {
        id: c.id,
        title: c.title,
        href: `/property/${c.slug}`,
        price: priceLabel(c, formats),
        facts: [
          c.beds !== null ? (c.beds === 0 ? bedsLabel(0) : `${c.beds} bed`) : null,
          c.size ? formatArea(c.size, market.areaUnit) : null,
          c.locationName,
        ]
          .filter(Boolean)
          .join(" · "),
        photo: c.photos[0] ? { url: c.photos[0].url, alt: c.photos[0].alt } : null,
      },
    ]),
  );
}
