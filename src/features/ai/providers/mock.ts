import {
  type AiContentBlock,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type AiStreamEvent,
  type AiToolResultBlock,
} from "../types";

/**
 * The built-in test provider: deterministic, no key, no network. Used in development without
 * a key, in unit/integration tests and in e2e (14 §5 "mocked model with fixed responses").
 *
 * What it answers, in order:
 * 1. the next scripted reply (`scriptMockReplies`), for a test that needs an exact turn;
 * 2. the first registered rule that matches (`registerMockRule`), for features that want a
 *    realistic canned flow (the customer assistant registers its own);
 * 3. a default: after tool results, a short answer quoting them (so it stays grounded);
 *    otherwise a plain acknowledgement.
 */

export type MockReply =
  { text: string } | { text?: string; toolCalls: Array<{ name: string; input: unknown }> };

export type MockContext = {
  lastUserText: string;
  /** Tool results in the last user message (empty on a plain user turn). */
  toolResults: AiToolResultBlock[];
  toolNames: string[];
  request: AiRequest;
};

export type MockRule = { name: string; reply: (ctx: MockContext) => MockReply | null };

type MockState = {
  script: Array<MockReply | ((ctx: MockContext) => MockReply)>;
  rules: MockRule[];
  calls: AiRequest[];
  counter: number;
};

const g = globalThis as { __propelAiMock?: MockState };
function state(): MockState {
  g.__propelAiMock ??= { script: [], rules: [], calls: [], counter: 0 };
  return g.__propelAiMock;
}

/** Queues exact replies for the next calls (tests). */
export function scriptMockReplies(...replies: MockState["script"]): void {
  state().script.push(...replies);
}

/** Adds (or replaces, by name) a canned rule. */
export function registerMockRule(rule: MockRule): void {
  const s = state();
  s.rules = [...s.rules.filter((r) => r.name !== rule.name), rule];
}

/** Every request the mock received since the last reset (tests inspect prompts and tools). */
export function mockCalls(): AiRequest[] {
  return state().calls;
}

export function resetMock(options: { keepRules?: boolean } = {}): void {
  const s = state();
  s.script = [];
  s.calls = [];
  s.counter = 0;
  if (!options.keepRules) s.rules = [];
}

/** Rough token count (4 characters per token) so usage logging has numbers to log. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function contextFor(req: AiRequest): MockContext {
  const last = [...req.messages].reverse().find((m) => m.role === "user");
  const blocks = last?.content ?? [];
  return {
    lastUserText: blocks
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n"),
    toolResults: blocks.filter((b): b is AiToolResultBlock => b.type === "tool_result"),
    toolNames: (req.tools ?? []).map((t) => t.name),
    request: req,
  };
}

/** Strips the data fence (tools/fence.ts) for a readable quote. */
function quote(result: AiToolResultBlock): string {
  const inner = result.content
    .replace(/^<tool_result[^>]*>\s*/, "")
    .replace(/\s*<\/tool_result>$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return inner.length > 240 ? `${inner.slice(0, 240)}…` : inner;
}

function defaultReply(ctx: MockContext): MockReply {
  if (ctx.toolResults.length > 0) {
    const failed = ctx.toolResults.every((r) => r.isError);
    if (failed) return { text: "I don't know that yet. I can ask our team to help you." };
    return {
      text: `Here is what I found: ${ctx.toolResults
        .filter((r) => !r.isError)
        .map(quote)
        .join(" | ")}`,
    };
  }
  return { text: "Thanks for your message. How can I help you today?" };
}

function respond(req: AiRequest): AiResponse {
  const s = state();
  s.calls.push(req);
  const ctx = contextFor(req);
  const next = s.script.shift();
  let reply: MockReply | null = next ? (typeof next === "function" ? next(ctx) : next) : null;
  if (!reply)
    for (const rule of s.rules) {
      reply = rule.reply(ctx);
      if (reply) break;
    }
  reply ??= defaultReply(ctx);

  const content: AiContentBlock[] = [];
  if (reply.text) content.push({ type: "text", text: reply.text });
  const calls = "toolCalls" in reply ? reply.toolCalls : [];
  for (const call of calls) {
    s.counter += 1;
    content.push({
      type: "tool_use",
      id: `toolu_mock_${String(s.counter).padStart(4, "0")}`,
      name: call.name,
      input: call.input,
    });
  }
  const promptChars =
    req.system.length +
    JSON.stringify(req.messages).length +
    (req.tools ? JSON.stringify(req.tools).length : 0);
  return {
    // Logged as "mock:<model>", which the price table treats as free.
    model: `mock:${req.model}`,
    content,
    stopReason: calls.length > 0 ? "tool_use" : "end_turn",
    usage: {
      inputTokens: estimateTokens(" ".repeat(promptChars)),
      outputTokens: estimateTokens(JSON.stringify(content)),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

export class MockProvider implements AiProvider {
  readonly name = "mock" as const;

  async complete(req: AiRequest): Promise<AiResponse> {
    return respond(req);
  }

  async *stream(req: AiRequest): AsyncGenerator<AiStreamEvent> {
    const response = respond(req);
    for (const block of response.content) {
      if (block.type === "text")
        for (const word of block.text.split(/(?<=\s)/)) yield { type: "text", text: word };
      else if (block.type === "tool_use")
        yield { type: "tool_use_start", id: block.id, name: block.name };
    }
    yield { type: "done", response };
  }
}
