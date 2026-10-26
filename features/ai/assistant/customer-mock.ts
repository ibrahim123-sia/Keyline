import { registerMockRule, type MockContext, type MockReply } from "../providers/mock";
import { unfence } from "../tools/fence";

/**
 * The customer assistant's canned flow for the built-in test provider (development without a
 * key, tests, e2e, `pnpm ai:eval` without a real model). Keyword rules pick a tool, and the
 * answer after a tool result only repeats what the tool returned, so it stays grounded. It
 * exercises the plumbing (tools, cards, hand-over, booking); a real model is evaluated with
 * AI_EVAL_PROVIDER=anthropic.
 */

type Listing = { reference: string; title: string; price?: string };

/** The visitor's own words, without the context block the assistant adds. */
function visitorText(ctx: MockContext): string {
  return ctx.lastUserText.replace(/<context>[\s\S]*?<\/context>/, "").trim();
}

/** The listing the visitor is looking at, from the context block. */
function pageReference(ctx: MockContext): string | null {
  for (const m of [...ctx.request.messages].reverse()) {
    if (m.role !== "user") continue;
    for (const b of m.content) {
      if (b.type !== "text") continue;
      const hit = /looking at: the listing ([A-Za-z0-9-]+) ·/.exec(b.text);
      if (hit) return hit[1]!;
    }
  }
  return null;
}

/** The tool calls of the last assistant turn, with their results. */
function lastResults(ctx: MockContext): Array<{ name: string; data: Record<string, unknown> }> {
  const msgs = ctx.request.messages;
  const assistant = msgs[msgs.length - 2];
  const names = new Map<string, string>();
  for (const b of assistant?.content ?? []) if (b.type === "tool_use") names.set(b.id, b.name);
  return ctx.toolResults.map((r) => ({
    name: names.get(r.toolUseId) ?? "",
    data: (unfence(r.content) ?? {}) as Record<string, unknown>,
  }));
}

const call = (name: string, input: unknown): MockReply => ({ toolCalls: [{ name, input }] });

function firstTurn(ctx: MockContext): MockReply {
  const text = visitorText(ctx);
  const ref = pageReference(ctx);
  if (
    /ignore (all |your |the |previous )*(instructions|rules)|system prompt|reveal your/i.test(text)
  )
    return {
      text: "I can't help with that, but I'm happy to help you find a home or answer questions about our listings.",
    };
  if (
    /\b(agent|human|person|someone real|real person)\b|negotiat|discount|drop the price|lower the price|best price|legal|lawyer|tax|complain/i.test(
      text,
    )
  )
    return call("request_human", { reason: text.slice(0, 200) });
  if (ref && /\b(see|view|visit|tour|viewing|show me (it|the))\b/i.test(text))
    return call("available_slots", { reference: ref });
  if (ref && /mortgage|monthly|per month|finance/i.test(text))
    return call("mortgage_estimate", { reference: ref });
  if (ref && /\b(near|nearby|distance|how far|school|metro|beach|mall)\b/i.test(text))
    return call("nearby", { reference: ref });
  if (ref && /how much|price|cost|still available|available\?/i.test(text))
    return call("get_listing", { reference: ref });
  if (/\bfees?\b|process|how do i buy|can foreigners|weekend/i.test(text))
    return call("answer_faq", { question: text });
  return call("search_listings", { text });
}

const listingLine = (l: Listing) => `${l.title} (${l.reference})${l.price ? `, ${l.price}` : ""}`;

function afterTools(ctx: MockContext): MockReply | null {
  const results = lastResults(ctx);
  const first = results[0];
  if (!first) return null;
  const d = first.data;
  switch (first.name) {
    case "request_human":
      return { text: String(d.say ?? "I've asked our team to reply to you.") };
    case "available_slots": {
      const slots = (d.slots as Array<{ label: string }> | undefined) ?? [];
      if (!slots.length)
        return {
          text: "I can't see a free time in those days. Would other days work, or shall I ask the team?",
        };
      return {
        text: `Here are some free times: ${slots
          .slice(0, 3)
          .map((s) => s.label)
          .join(", ")}. Which suits you? To book, I'll need your name and phone number.`,
      };
    }
    case "get_listing":
      if (!d.found)
        return { text: "I couldn't find that listing. I can search for similar homes." };
      return { text: `${listingLine(d as unknown as Listing)}. Status: ${String(d.status)}.` };
    case "search_listings": {
      const listings = (d.listings as Listing[] | undefined) ?? [];
      const sure = d.confidence === "high" || d.confidence === "medium";
      if (!listings.length || !sure)
        return {
          text: "I couldn't find a matching home in our listings, so I don't know of one. I can ask our team to look for you.",
        };
      // A price question about one home: fetch it live before stating the price.
      const asked = [...ctx.request.messages]
        .reverse()
        .find((m) => m.role === "user" && m.content.some((b) => b.type === "text"));
      const question = asked?.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join(" ")
        .replace(/<context>[\s\S]*?<\/context>/, "");
      if (/how much|price|cost/i.test(question ?? ""))
        return call("get_listing", { reference: listings[0]!.reference });
      return {
        text: `I found ${listings.length === 1 ? "one home" : `${listings.length} homes`}: ${listings
          .slice(0, 3)
          .map(listingLine)
          .join("; ")}.`,
      };
    }
    case "nearby": {
      const places = (d.places as Array<{ name: string; distance: string }> | undefined) ?? [];
      return {
        text: places.length
          ? `Nearby: ${places
              .slice(0, 3)
              .map((p) => `${p.name} (${p.distance})`)
              .join(", ")}.`
          : "I don't have that distance for this home.",
      };
    }
    case "answer_faq": {
      const answers = (d.answers as Array<{ text: string }> | undefined) ?? [];
      const sure = d.confidence === "high" || d.confidence === "medium";
      return {
        text:
          answers[0] && sure
            ? answers[0].text.slice(0, 400)
            : "I don't know that one. I can ask our team to help you.",
      };
    }
    case "mortgage_estimate":
      return d.monthlyPayment
        ? {
            text: `As an estimate, the monthly payment would be about ${String(d.monthlyPayment)}.`,
          }
        : { text: "I can't work that out for this home. Our team can help." };
    default:
      return null;
  }
}

export function registerCustomerMockRules(): void {
  registerMockRule({
    name: "customer-assistant",
    reply(ctx) {
      // Only the customer assistant's requests (they carry its tools).
      if (!ctx.toolNames.includes("search_listings") || !ctx.toolNames.includes("request_human"))
        return null;
      return ctx.toolResults.length ? afterTools(ctx) : firstTurn(ctx);
    },
  });
}
