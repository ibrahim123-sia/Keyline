import "server-only";
import { getDb, type DbOrTx } from "@/db/client";
import type { AiFeature } from "@/db/schema/ai";
import { ai as t } from "@/lib/i18n/dictionaries/ai";
import { proposeAction, type ProposedAction } from "./actions";
import { AiNotConfiguredError, providerFor, type AiConfig, type ModelTier } from "./config";
import { checkAiAvailable, notifySpendThresholds, type AiBlockReason } from "./limits";
import { costMicros } from "./pricing";
import { fenceToolResult } from "./tools/fence";
import { describeIssues, toolSpec, type AiToolContext, type AnyAiTool } from "./tools/registry";
import { recordUsage } from "./usage";
import {
  addUsage,
  AiProviderError,
  emptyUsage,
  responseText,
  type AiEffort,
  type AiMessage,
  type AiProvider,
  type AiResponse,
  type AiStreamEvent,
  type AiToolResultBlock,
  type AiToolUseBlock,
  type AiUsageCount,
} from "./types";

/**
 * The agent loop (10 intro): call the model, run the read tools it asks for, turn write tools
 * into proposals, send the fenced results back, and stop when it answers, after `maxSteps`
 * model calls, or on a refusal. Every call is logged in `ai_usage` and counts against the
 * budgets. The caller decides what to show when the run is not "done".
 */

export type ToolCallLog = {
  id: string;
  name: string;
  input: unknown;
  ok: boolean;
  /** The data the model saw (read tools) - what grounding checks compare against. */
  output?: unknown;
  error?: string;
  actionId?: string;
};

export type RunStatus = "done" | "max_steps" | "max_tokens" | "refusal" | "unavailable" | "error";

export type RunAgentResult = {
  status: RunStatus;
  /** The model's final text (empty when it did not answer). */
  text: string;
  /** The conversation including this run's turns (store it for the next turn). */
  messages: AiMessage[];
  toolCalls: ToolCallLog[];
  proposals: ProposedAction[];
  usage: AiUsageCount;
  costMicros: number;
  model: string | null;
  steps: number;
  unavailable?: { reason: AiBlockReason | "no_key"; message: string };
  error?: string;
};

export type RunEvent = AiStreamEvent | { type: "tool_result"; call: ToolCallLog };

export type RunAgentOptions = {
  feature: AiFeature;
  tier?: ModelTier;
  system: string;
  messages: AiMessage[];
  tools?: AnyAiTool[];
  /** Who is asking; write tools need an admin. */
  context: Omit<AiToolContext, "feature" | "db">;
  maxSteps?: number;
  maxTokens?: number;
  effort?: AiEffort;
  /** Streams text and tool progress as it happens (chat UIs). */
  onEvent?: (event: RunEvent) => void;
  signal?: AbortSignal;
  db?: DbOrTx;
  /** Already checked by the caller (skips the availability check). */
  config?: AiConfig;
  provider?: AiProvider;
  now?: Date;
};

export const DEFAULT_MAX_STEPS = 6;

async function callModel(
  provider: AiProvider,
  request: Parameters<AiProvider["complete"]>[0],
  onEvent?: (e: RunEvent) => void,
): Promise<AiResponse> {
  if (!onEvent) return provider.complete(request);
  let final: AiResponse | null = null;
  for await (const event of provider.stream(request)) {
    if (event.type === "done") final = event.response;
    else onEvent(event);
  }
  if (!final) throw new AiProviderError("The AI provider stream ended early.");
  return final;
}

async function runTool(
  call: AiToolUseBlock,
  tools: AnyAiTool[],
  ctx: AiToolContext,
  db: DbOrTx,
): Promise<{ log: ToolCallLog; result: AiToolResultBlock; proposal?: ProposedAction }> {
  const fail = (error: string) => ({
    log: { id: call.id, name: call.name, input: call.input, ok: false, error },
    result: {
      type: "tool_result" as const,
      toolUseId: call.id,
      content: fenceToolResult(call.name, { error }),
      isError: true,
    },
  });
  const tool = tools.find((x) => x.name === call.name);
  if (!tool) return fail(`There is no tool called "${call.name}".`);
  const parsed = tool.input.safeParse(call.input);
  if (!parsed.success) return fail(`Invalid input: ${describeIssues(parsed.error)}`);

  try {
    if (tool.kind === "read") {
      const output = await tool.run(parsed.data, { ...ctx, db });
      return {
        log: { id: call.id, name: call.name, input: parsed.data, ok: true, output },
        result: {
          type: "tool_result",
          toolUseId: call.id,
          content: fenceToolResult(call.name, output),
        },
      };
    }
    if (ctx.actor.type !== "admin") return fail("Only an admin's assistant can propose changes.");
    const preview = await tool.preview(parsed.data, { ...ctx, db });
    const proposal = await proposeAction(
      {
        tool,
        input: parsed.data,
        preview,
        adminId: ctx.actor.admin.user.id,
        conversationRef: ctx.conversationRef,
        source: ctx.source,
      },
      db,
    );
    const output = {
      status: "proposed",
      actionId: proposal.id,
      preview,
      note: "Nothing has changed yet. The admin sees this preview and confirms, edits or cancels it.",
    };
    return {
      log: {
        id: call.id,
        name: call.name,
        input: parsed.data,
        ok: true,
        output,
        actionId: proposal.id,
      },
      result: {
        type: "tool_result",
        toolUseId: call.id,
        content: fenceToolResult(call.name, output),
      },
      proposal,
    };
  } catch (err) {
    // Tool errors go back to the model as data (never a stack trace).
    const message = err instanceof Error ? err.message : "The tool failed.";
    console.warn(`[ai] tool ${call.name} failed:`, message);
    return fail(message.slice(0, 300));
  }
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const db = options.db ?? (await getDb());
  const messages = [...options.messages];
  const toolCalls: ToolCallLog[] = [];
  const proposals: ProposedAction[] = [];
  let usage = emptyUsage();
  let cost = 0;
  let model: string | null = null;
  let steps = 0;
  const finish = (status: RunStatus, text: string, extra: Partial<RunAgentResult> = {}) => ({
    status,
    text,
    messages,
    toolCalls,
    proposals,
    usage,
    costMicros: cost,
    model,
    steps,
    ...extra,
  });

  let config = options.config;
  if (!config) {
    const availability = await checkAiAvailable(options.feature, { db, now: options.now });
    if (!availability.ok)
      return finish("unavailable", "", {
        unavailable: { reason: availability.reason, message: availability.message },
      });
    config = availability.config;
  }

  let provider: AiProvider;
  try {
    provider = options.provider ?? (await providerFor(config, db));
  } catch (err) {
    if (err instanceof AiNotConfiguredError)
      return finish("unavailable", "", {
        unavailable: { reason: "no_key", message: t.unavailable.no_key },
      });
    throw err;
  }

  const tools = options.tools ?? [];
  const specs = tools.map(toolSpec);
  const ctx: AiToolContext = { ...options.context, feature: options.feature, db };
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const requestModel = config.models[options.tier ?? "chat"];

  while (steps < maxSteps) {
    steps += 1;
    let response: AiResponse;
    try {
      response = await callModel(
        provider,
        {
          model: requestModel,
          system: options.system,
          // A copy: the history grows after the call.
          messages: [...messages],
          tools: specs.length ? specs : undefined,
          maxTokens: options.maxTokens ?? 4096,
          effort: options.effort,
          signal: options.signal,
        },
        options.onEvent,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ai] ${options.feature} call failed:`, message);
      return finish("error", "", { error: message });
    }

    model = response.model;
    usage = addUsage(usage, response.usage);
    try {
      cost += await recordUsage(
        { feature: options.feature, model: response.model, usage: response.usage },
        { db, now: options.now },
      );
      await notifySpendThresholds(db, options.now);
    } catch (err) {
      console.error("[ai] usage logging failed:", (err as Error).message);
      cost += costMicros(response.model, response.usage);
    }

    messages.push({ role: "assistant", content: response.content });
    const text = responseText(response.content);
    if (response.stopReason === "refusal") return finish("refusal", text);
    if (response.stopReason === "max_tokens") return finish("max_tokens", text);
    const calls = response.content.filter((b): b is AiToolUseBlock => b.type === "tool_use");
    if (response.stopReason !== "tool_use" || calls.length === 0) return finish("done", text);

    // All results go back in one user message, in the order of the calls.
    const outcomes = await Promise.all(calls.map((call) => runTool(call, tools, ctx, db)));
    for (const o of outcomes) {
      toolCalls.push(o.log);
      if (o.proposal) proposals.push(o.proposal);
      options.onEvent?.({ type: "tool_result", call: o.log });
    }
    messages.push({ role: "user", content: outcomes.map((o) => o.result) });
  }
  return finish("max_steps", t.stepsExhausted);
}

/** One call without tools (helpers: descriptions, SEO, summaries, scoring). */
export async function generateText(options: {
  feature: AiFeature;
  tier?: ModelTier;
  system: string;
  user: string;
  maxTokens?: number;
  effort?: AiEffort;
  db?: DbOrTx;
  config?: AiConfig;
  provider?: AiProvider;
  now?: Date;
}): Promise<RunAgentResult> {
  return runAgent({
    feature: options.feature,
    tier: options.tier ?? "fast",
    system: options.system,
    messages: [{ role: "user", content: [{ type: "text", text: options.user }] }],
    context: { actor: { type: "visitor", visitorId: null } },
    maxSteps: 1,
    maxTokens: options.maxTokens ?? 2048,
    effort: options.effort,
    db: options.db,
    config: options.config,
    provider: options.provider,
    now: options.now,
  });
}

/** The first JSON object in a model reply (helpers ask for JSON only; tolerate code fences). */
export function parseJsonReply(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
