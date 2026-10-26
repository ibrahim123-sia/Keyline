import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { properties } from "@/db/schema/properties";
import { historyMessages, runCustomerTurn, type ChatLine } from "@/features/ai/assistant/customer";
import type { EvalWorld } from "./fixtures";
import type { EvalAgent } from "./types";

/**
 * Assistants under test. Each gets the database and the fixture world, and runs one turn per
 * question (earlier turns from the case's history, visitor first, then alternating).
 */
export const evalAgents: Partial<Record<"customer", (db: DbOrTx, world: EvalWorld) => EvalAgent>> =
  {
    customer:
      (db, world) =>
      async ({ question, page, history }) => {
        const lines: ChatLine[] = [
          ...(history ?? []).map((body, i) => ({
            sender: i % 2 === 0 ? ("customer" as const) : ("ai" as const),
            body,
          })),
          { sender: "customer", body: question },
        ];
        let path: string | null = null;
        if (page?.listing) {
          const [row] = await db
            .select({ slug: properties.slug })
            .from(properties)
            .where(eq(properties.id, world.listings[page.listing].id));
          path = row ? `/property/${row.slug}` : null;
        } else if (page?.area) path = `/areas/${page.area}`;
        else if (page?.search) path = page.search;
        const turn = await runCustomerTurn({ db, history: historyMessages(lines), page: { path } });
        return {
          text: turn.text,
          toolCalls: turn.toolCalls.map((c) => ({
            name: c.name,
            input: c.input,
            output: c.output,
          })),
          handedOver: turn.handedOver,
        };
      },
  };
