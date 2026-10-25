import "server-only";
import { createElement } from "react";
import { getDb, type DbOrTx } from "@/db/client";
import type { AiFeature } from "@/db/schema/ai";
import { rateLimits } from "@/db/schema/system";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import { TemplateEmail } from "@/emails/template-email";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { env } from "@/lib/env";
import { ai as t } from "@/lib/i18n/dictionaries/ai";
import { format } from "@/lib/i18n";
import { hit, type RateLimitRule } from "@/lib/rate-limit";
import { featureSwitch, loadAiConfig, switchOn, type AiConfig } from "./config";
import { microsToCents } from "./pricing";
import { spendSummary } from "./usage";

/**
 * When AI may run (10 intro, 04 §9): the master switch, the feature's own switch, the daily
 * budget and the monthly spend limit. A blocked feature never errors at the visitor: callers
 * fall back to the plain flow (chat to the team, rule-based score, no helper).
 */

export type AiBlockReason = "off" | "feature_off" | "monthly_limit" | "daily_limit";

export type AiAvailability =
  | { ok: true; config: AiConfig }
  | { ok: false; reason: AiBlockReason; message: string; config: AiConfig };

export async function checkAiAvailable(
  feature: AiFeature,
  options: { db?: DbOrTx; now?: Date } = {},
): Promise<AiAvailability> {
  const db = options.db ?? (await getDb());
  const config = await loadAiConfig(db);
  const block = (reason: AiBlockReason): AiAvailability => ({
    ok: false,
    reason,
    message: t.unavailable[reason],
    config,
  });
  if (!config.enabled) return block("off");
  const sw = featureSwitch[feature];
  if (sw && !switchOn(config, sw)) return block("feature_off");
  // The test provider costs nothing, so it never trips a budget.
  if (config.provider === "mock" && feature !== "embeddings") return { ok: true, config };

  const { monthlySpendLimitCents, dailySpendLimitCents } = config.ai;
  if (monthlySpendLimitCents > 0 || dailySpendLimitCents > 0) {
    const spend = await spendSummary(db, options.now);
    if (monthlySpendLimitCents > 0 && microsToCents(spend.monthMicros) >= monthlySpendLimitCents)
      return block("monthly_limit");
    if (dailySpendLimitCents > 0 && microsToCents(spend.todayMicros) >= dailySpendLimitCents)
      return block("daily_limit");
  }
  return { ok: true, config };
}

/* Rate limits per visitor and per IP (10 §2 Safety, 14 §2) -------------------------------- */

export const aiRateRules = {
  visitorMinute: { limit: 12, windowSeconds: 60 },
  visitorDay: { limit: 150, windowSeconds: 86_400 },
  ipMinute: { limit: 40, windowSeconds: 60 },
  ipDay: { limit: 600, windowSeconds: 86_400 },
} satisfies Record<string, RateLimitRule>;

export type RateCheck = { allowed: true } | { allowed: false; retryAt: Date; message: string };

/** Counts one AI message for a visitor (or customer) and their IP. */
export async function checkAiRate(
  who: { visitorId?: string | null; ip?: string | null },
  options: { db?: DbOrTx; now?: Date } = {},
): Promise<RateCheck> {
  const checks: Array<[string, RateLimitRule]> = [];
  if (who.visitorId) {
    checks.push([`ai-visitor:${who.visitorId}`, aiRateRules.visitorMinute]);
    checks.push([`ai-visitor-day:${who.visitorId}`, aiRateRules.visitorDay]);
  }
  if (who.ip) {
    checks.push([`ai-ip:${who.ip}`, aiRateRules.ipMinute]);
    checks.push([`ai-ip-day:${who.ip}`, aiRateRules.ipDay]);
  }
  for (const [key, rule] of checks) {
    const res = await hit(key, rule, options.db, options.now);
    if (!res.allowed)
      return { allowed: false, retryAt: res.resetAt, message: t.unavailable.rate_limited };
  }
  return { allowed: true };
}

/* Spend alert emails ---------------------------------------------------------------------- */

/** True the first time a marker is set (one email per month and kind). */
async function firstTime(db: DbOrTx, key: string, now: Date): Promise<boolean> {
  const inserted = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt: new Date(now.getTime() + 40 * 86_400_000) })
    .onConflictDoNothing()
    .returning({ key: rateLimits.key });
  return inserted.length > 0;
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/**
 * After usage is recorded: emails the lead inbox once when the month's spend passes the
 * warning level, and once when it reaches the limit (04 §9 "Monthly AI spend limit and alert").
 */
export async function notifySpendThresholds(db: DbOrTx, now: Date = new Date()): Promise<void> {
  const ai = await loadSettings("ai", db);
  const limit = ai.monthlySpendLimitCents;
  if (limit <= 0) return;
  const spend = await spendSummary(db, now);
  const spent = microsToCents(spend.monthMicros);
  const month = spend.today.slice(0, 7);
  const reached = spent >= limit;
  const warned = spent >= Math.ceil((limit * ai.spendAlertPct) / 100);
  if (!reached && !warned) return;

  const kind = reached ? "limit" : "alert";
  if (!(await firstTime(db, `ai-spend-${kind}:${month}`, now))) return;
  const contact = await loadSettings("contact", db);
  const to = contact.leadNotifyEmails.length ? contact.leadNotifyEmails : [contact.email];
  const vars = { pct: ai.spendAlertPct, spent: usd(spent), limit: usd(limit) };
  const subject = format(reached ? t.budgetEmail.limitSubject : t.budgetEmail.alertSubject, vars);
  const body = format(reached ? t.budgetEmail.limitBody : t.budgetEmail.alertBody, vars);
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(TemplateEmail, {
      brand,
      preview: subject,
      body,
      button: { label: t.budgetEmail.button, href: `${env().APP_URL}/admin/settings/ai` },
    }),
  );
  for (const address of to.filter(Boolean))
    await queueEmail({ to: address, subject, template: `ai.spend-${kind}`, html, text }, db);
}
