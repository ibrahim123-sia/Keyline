import { registerMockRule, type MockContext, type MockReply } from "../providers/mock";
import { unfence } from "../tools/fence";

/**
 * The admin assistant's canned flow for the built-in test provider (development without a
 * key, tests and e2e). Keywords pick a read tool or propose a change; the answer only repeats
 * what the tools returned. A real model is evaluated with a key.
 */

const call = (name: string, input: unknown): MockReply => ({ toolCalls: [{ name, input }] });

function adminText(ctx: MockContext): string {
  return ctx.lastUserText.replace(/<context>[\s\S]*?<\/context>/, "").trim();
}

/** The lead or listing id of the page the admin is on, from the context block. */
function pageEntity(ctx: MockContext): { kind: "lead" | "listing"; id: string } | null {
  for (const m of [...ctx.request.messages].reverse()) {
    if (m.role !== "user") continue;
    for (const b of m.content) {
      if (b.type !== "text") continue;
      const hit = /looking at: the (lead|listing) ([0-9a-f-]{36})/.exec(b.text);
      if (hit) return { kind: hit[1] as "lead" | "listing", id: hit[2]! };
    }
  }
  return null;
}

function firstTurn(ctx: MockContext): MockReply {
  const text = adminText(ctx);
  const page = pageEntity(ctx);
  const ref = /\b[A-Z]{1,5}-\d{3,7}\b/i.exec(text)?.[0];
  const price = /price/i.test(text) ? /\bto\s+([\d,]{3,}(?:\.\d+)?)/i.exec(text)?.[1] : undefined;
  if (ref && price)
    return call("update_listing", { reference: ref, price: Number(price.replace(/,/g, "")) });
  if (page?.kind === "lead" && /\b(task|remind|follow[- ]?up)\b/i.test(text))
    return call("create_task", {
      leadId: page.id,
      title: text
        .replace(/^(please )?(add|create) (a )?(task|reminder)( to)?:?\s*/i, "")
        .slice(0, 200),
    });
  if (/waiting|unanswered|no reply|not answered/i.test(text)) return call("unanswered_leads", {});
  if (/by source|sources/i.test(text))
    return call("report", { report: "sources", period: /week|7/i.test(text) ? "7d" : "30d" });
  if (/how many leads|leads this|overview/i.test(text))
    return call("report", { report: "overview", period: /week|7/i.test(text) ? "7d" : "30d" });
  if (/stale|verif|no inquir/i.test(text)) return call("stale_listings", {});
  if (/\bseo\b/i.test(text)) return call("seo_issues", {});
  if (ref) return call("get_listing", { reference: ref });
  if (page?.kind === "lead") return call("get_lead", { id: page.id });
  return {
    text: "I can answer questions about leads, listings and reports, and prepare changes for you to confirm.",
  };
}

function afterTools(ctx: MockContext): MockReply {
  const msgs = ctx.request.messages;
  const names = new Map<string, string>();
  for (const b of msgs[msgs.length - 2]?.content ?? [])
    if (b.type === "tool_use") names.set(b.id, b.name);
  const [first] = ctx.toolResults;
  if (!first) return { text: "Done." };
  const name = names.get(first.toolUseId) ?? "";
  const d = (unfence(first.content) ?? {}) as Record<string, unknown>;
  if (first.isError) return { text: `That did not work: ${String(d.error ?? "unknown error")}` };
  if (d.status === "proposed") {
    const preview = d.preview as { summary?: string } | undefined;
    return {
      text: `I've prepared this: ${preview?.summary ?? name}. Nothing changes until you confirm it below.`,
    };
  }
  if (name === "unanswered_leads" || name === "query_leads") {
    const leads = (d.leads as Array<{ name: string }> | undefined) ?? [];
    return {
      text: leads.length
        ? `${String(d.total)} waiting: ${leads.map((l) => l.name).join(", ")}.`
        : "Nobody is waiting for a reply.",
    };
  }
  if (name === "report") {
    const kpis = (d.kpis as Array<{ name: string; value: unknown }> | undefined) ?? [];
    return {
      text: kpis.length
        ? kpis.map((k) => `${k.name}: ${String(k.value)}`).join("\n")
        : `${String(d.report)}: ${String(d.empty ?? "no numbers yet")}`,
    };
  }
  if (name === "get_listing" && d.found)
    return {
      text: `${String(d.reference)} · ${String(d.title)}: ${String(d.status)}, ${String(d.price)}.`,
    };
  if (name === "get_lead" && d.found)
    return { text: `${(d.contact as { name: string }).name}: ${String(d.stage ?? "no stage")}.` };
  return { text: `Here is what I found: ${JSON.stringify(d).slice(0, 300)}` };
}

export function registerAdminMockRules(): void {
  registerMockRule({
    name: "admin-assistant",
    reply(ctx) {
      if (!ctx.toolNames.includes("query_leads")) return null;
      return ctx.toolResults.length ? afterTools(ctx) : firstTurn(ctx);
    },
  });
}
