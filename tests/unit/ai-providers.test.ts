import { beforeEach, describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  anthropicBaseUrl,
  anthropicRequestBody,
} from "@/features/ai/providers/anthropic";
import {
  mockCalls,
  MockProvider,
  registerMockRule,
  resetMock,
  scriptMockReplies,
} from "@/features/ai/providers/mock";
import { parseSse } from "@/features/ai/providers/sse";
import { fenceToolResult } from "@/features/ai/tools/fence";
import { AiProviderError, type AiRequest, type AiStreamEvent } from "@/features/ai/types";

const encoder = new TextEncoder();
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}
const sse = (events: Array<[string, unknown]>) =>
  events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const request = (over: Partial<AiRequest> = {}): AiRequest => ({
  model: "claude-sonnet-5-5",
  system: "You are a test.",
  messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
  maxTokens: 1000,
  ...over,
});

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("no more fake responses");
    return next();
  }) as typeof fetch;
  return { fn, calls };
}

describe("server-sent events", () => {
  it("parses events split across chunks, with CRLF, comments and multi-line data", async () => {
    const events = [];
    for await (const e of parseSse(
      streamOf([
        "event: a\r\nda",
        'ta: {"x":1}\r\n\r\n: ping\n\nevent: b\ndata: one\ndata: two\n\n',
        "data: tail",
      ]),
    ))
      events.push(e);
    expect(events).toEqual([
      { event: "a", data: '{"x":1}' },
      { event: "b", data: "one\ntwo" },
      { event: "message", data: "tail" },
    ]);
  });
});

describe("Anthropic provider (fetch, no SDK)", () => {
  it("builds the Messages API request: cached system, tools, effort, no sampling params", () => {
    const body = anthropicRequestBody(
      request({
        tools: [{ name: "get_listing", description: "d", inputSchema: { type: "object" } }],
        effort: "low",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hi" },
              { type: "text", text: "  " },
            ],
          },
          {
            role: "assistant",
            content: [
              {
                type: "opaque",
                provider: "anthropic",
                raw: { type: "thinking", thinking: "", signature: "sig" },
              },
              { type: "tool_use", id: "t1", name: "get_listing", input: { reference: "HD-1" } },
            ],
          },
          {
            role: "user",
            content: [
              { type: "tool_result", toolUseId: "t1", content: "<tool_result>..", isError: true },
            ],
          },
        ],
      }),
      true,
    );
    expect(body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      system: [{ type: "text", text: "You are a test.", cache_control: { type: "ephemeral" } }],
      messages: [
        { role: "user", content: [{ type: "text", text: "Hi" }] },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "tool_use", id: "t1", name: "get_listing", input: { reference: "HD-1" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "<tool_result>..", is_error: true },
          ],
        },
      ],
      tools: [{ name: "get_listing", description: "d", input_schema: { type: "object" } }],
      output_config: { effort: "low" },
      fallbacks: "default",
      stream: true,
    });
    expect(body).not.toHaveProperty("temperature");
    expect(anthropicRequestBody(request({ model: "claude-haiku-5-5" }), false)).not.toHaveProperty(
      "fallbacks",
    );
  });

  it("goes through the AI Gateway when it is set, with its token", async () => {
    expect(anthropicBaseUrl(null)).toBe("https://api.anthropic.com");
    expect(anthropicBaseUrl({ accountId: "acc", name: "keyline" })).toBe(
      "https://gateway.ai.cloudflare.com/v1/acc/keyline/anthropic",
    );
    const { fn, calls } = fakeFetch([
      () =>
        Response.json({
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: "Hi there" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 100 },
        }),
    ]);
    const provider = new AnthropicProvider({
      apiKey: "sk-test",
      gateway: { accountId: "acc", name: "keyline", token: "gw" },
      fetch: fn,
    });
    const res = await provider.complete(request({ model: "claude-haiku-5-5" }));
    expect(calls[0]!.url).toBe(
      "https://gateway.ai.cloudflare.com/v1/acc/keyline/anthropic/v1/messages",
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["cf-aig-authorization"]).toBe("Bearer gw");
    expect(headers["anthropic-beta"]).toBeUndefined();
    expect(res).toEqual({
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "Hi there" }],
      stopReason: "end_turn",
      usage: { inputTokens: 12, outputTokens: 3, cacheReadTokens: 100, cacheWriteTokens: 0 },
    });
  });

  it("retries overloads, then reports API errors with their message", async () => {
    const { fn, calls } = fakeFetch([
      () => new Response("overloaded", { status: 529, headers: { "retry-after": "0" } }),
      () =>
        Response.json(
          {
            type: "error",
            error: { type: "invalid_request_error", message: "max_tokens: too big" },
          },
          { status: 400 },
        ),
    ]);
    const provider = new AnthropicProvider({ apiKey: "k", fetch: fn });
    const err = await provider.complete(request()).catch((e: unknown) => e);
    expect(calls).toHaveLength(2);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).status).toBe(400);
    expect((err as Error).message).toMatch(/400: max_tokens: too big/);
  });

  it("streams text, assembles tool inputs from JSON fragments and keeps thinking blocks", async () => {
    const body = sse([
      [
        "message_start",
        {
          type: "message_start",
          message: { model: "claude-sonnet-5-5", usage: { input_tokens: 50, output_tokens: 1 } },
        },
      ],
      [
        "content_block_start",
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
      ],
      [
        "content_block_delta",
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "signature_delta", signature: "abc" },
        },
      ],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      [
        "content_block_start",
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      ],
      ["ping", { type: "ping" }],
      [
        "content_block_delta",
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Let me " } },
      ],
      [
        "content_block_delta",
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "check." } },
      ],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      [
        "content_block_start",
        {
          type: "content_block_start",
          index: 2,
          content_block: { type: "tool_use", id: "toolu_1", name: "search_listings", input: {} },
        },
      ],
      [
        "content_block_delta",
        {
          type: "content_block_delta",
          index: 2,
          delta: { type: "input_json_delta", partial_json: '{"text": "sea' },
        },
      ],
      [
        "content_block_delta",
        {
          type: "content_block_delta",
          index: 2,
          delta: { type: "input_json_delta", partial_json: ' view"}' },
        },
      ],
      ["content_block_stop", { type: "content_block_stop", index: 2 }],
      [
        "message_delta",
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 40 } },
      ],
      ["message_stop", { type: "message_stop" }],
    ]);
    const { fn } = fakeFetch([() => new Response(streamOf([body.slice(0, 333), body.slice(333)]))]);
    const provider = new AnthropicProvider({ apiKey: "k", fetch: fn });
    const events: AiStreamEvent[] = [];
    for await (const e of provider.stream(request())) events.push(e);
    expect(
      events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text),
    ).toEqual(["Let me ", "check."]);
    expect(events).toContainEqual({
      type: "tool_use_start",
      id: "toolu_1",
      name: "search_listings",
    });
    const done = events.at(-1) as Extract<AiStreamEvent, { type: "done" }>;
    expect(done.response).toEqual({
      model: "claude-sonnet-5-5",
      stopReason: "tool_use",
      usage: { inputTokens: 50, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
      content: [
        {
          type: "opaque",
          provider: "anthropic",
          raw: { type: "thinking", thinking: "", signature: "abc" },
        },
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "toolu_1", name: "search_listings", input: { text: "sea view" } },
      ],
    });
  });

  it("turns a stream error event into a provider error", async () => {
    const { fn } = fakeFetch([
      () =>
        new Response(
          streamOf([
            sse([
              [
                "error",
                { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
              ],
            ]),
          ]),
        ),
    ]);
    const provider = new AnthropicProvider({ apiKey: "k", fetch: fn });
    const run = async () => {
      for await (const e of provider.stream(request())) void e;
    };
    await expect(run()).rejects.toThrow(/Overloaded/);
  });
});

describe("mock provider", () => {
  beforeEach(() => resetMock());

  it("plays scripted replies first, then rules, then a grounded default", async () => {
    const provider = new MockProvider();
    scriptMockReplies({ toolCalls: [{ name: "get_listing", input: { reference: "HD-1" } }] });
    registerMockRule({
      name: "greeting",
      reply: (ctx) => (/hello/i.test(ctx.lastUserText) ? { text: "Hi! Buy or rent?" } : null),
    });
    const first = await provider.complete(request());
    expect(first.stopReason).toBe("tool_use");
    expect(first.content).toEqual([
      {
        type: "tool_use",
        id: "toolu_mock_0001",
        name: "get_listing",
        input: { reference: "HD-1" },
      },
    ]);
    expect((await provider.complete(request())).content).toEqual([
      { type: "text", text: "Hi! Buy or rent?" },
    ]);
    const afterTool = await provider.complete(
      request({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                toolUseId: "toolu_mock_0001",
                content: fenceToolResult("get_listing", {
                  title: "Marina flat",
                  status: "available",
                }),
              },
            ],
          },
        ],
      }),
    );
    expect(afterTool.content).toEqual([
      { type: "text", text: 'Here is what I found: {"title":"Marina flat","status":"available"}' },
    ]);
    expect(afterTool.usage.inputTokens).toBeGreaterThan(0);
    expect(mockCalls()).toHaveLength(3);
  });

  it("streams words and ends with the whole response", async () => {
    scriptMockReplies({ text: "Two homes match." });
    const events: AiStreamEvent[] = [];
    for await (const e of new MockProvider().stream(request())) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["text", "text", "text", "done"]);
  });
});
