import "server-only";
import type { DbOrTx } from "@/db/client";
import type { AiFeature } from "@/db/schema/ai";
import { loadSettings } from "@/features/settings/queries";
import type { SettingsOf } from "@/features/settings/schema";
import { getSecret } from "@/features/settings/secrets";
import { AnthropicProvider } from "./providers/anthropic";
import { MockProvider } from "./providers/mock";
import type { AiProvider } from "./types";

/**
 * Which provider and models the AI layer uses, from Settings -> Integrations (provider, models,
 * gateway, encrypted keys) and Settings -> AI (switches, budgets, the assistant's rules).
 * Model ids are never hard-coded here: they come from Settings.
 */

export type ModelTier = "chat" | "fast";

/** The admin's on/off switches (04 §9), one per AI feature. */
export type AiSwitch =
  "customerChat" | "whatsapp" | "adminAssistant" | "writingHelpers" | "leadScoring" | "mcp";

/** Which switch turns each logged feature on or off. */
export const featureSwitch: Record<AiFeature, AiSwitch | null> = {
  customer_chat: "customerChat",
  whatsapp: "whatsapp",
  admin_chat: "adminAssistant",
  listing_from_text: "adminAssistant",
  topics: "adminAssistant",
  description: "writingHelpers",
  seo: "writingHelpers",
  blog: "writingHelpers",
  alt_text: "writingHelpers",
  valuation: "writingHelpers",
  scoring: "leadScoring",
  summary: "leadScoring",
  embeddings: null,
};

export type AiConfig = {
  /** The master switch in Settings -> Integrations. */
  enabled: boolean;
  provider: "anthropic" | "mock";
  models: Record<ModelTier, string>;
  gateway: { accountId: string; name: string } | null;
  embedding: { provider: "mock" | "workers_ai"; model: string };
  ai: SettingsOf<"ai">;
};

export async function loadAiConfig(db?: DbOrTx): Promise<AiConfig> {
  const [integrations, ai] = await Promise.all([
    loadSettings("integrations", db),
    loadSettings("ai", db),
  ]);
  const i = integrations.ai;
  return {
    enabled: i.enabled,
    provider: i.provider,
    models: { chat: i.chatModel, fast: i.fastModel || i.chatModel },
    gateway:
      i.gatewayAccountId && i.gatewayName
        ? { accountId: i.gatewayAccountId, name: i.gatewayName }
        : null,
    embedding: { provider: i.embeddingProvider, model: i.embeddingModel },
    ai,
  };
}

export function switchOn(config: AiConfig, name: AiSwitch): boolean {
  if (name === "adminAssistant") return config.ai.adminAssistantEnabled;
  return config.ai.features[name];
}

/** Whether the editors show their AI writing buttons (master switch and "Writing helpers"). */
export async function writingHelpersOn(db?: DbOrTx): Promise<boolean> {
  const config = await loadAiConfig(db);
  return config.enabled && switchOn(config, "writingHelpers");
}

export class AiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

const g = globalThis as { __keylineAiProviderOverride?: AiProvider | null };

/** Tests and the eval script can swap the provider (e.g. Anthropic over a fake fetch). */
export function setProviderOverride(provider: AiProvider | null): void {
  g.__keylineAiProviderOverride = provider;
}

/** The provider for the current settings. Anthropic needs its key in Settings -> Integrations. */
export async function providerFor(config: AiConfig, db?: DbOrTx): Promise<AiProvider> {
  if (g.__keylineAiProviderOverride) return g.__keylineAiProviderOverride;
  if (config.provider === "mock") return new MockProvider();
  const [apiKey, gatewayToken] = await Promise.all([
    getSecret("ai_api_key", db),
    config.gateway ? getSecret("ai_gateway_token", db) : Promise.resolve(null),
  ]);
  if (!apiKey) throw new AiNotConfiguredError("The AI provider key is missing.");
  return new AnthropicProvider({
    apiKey,
    gateway: config.gateway ? { ...config.gateway, token: gatewayToken } : null,
  });
}
