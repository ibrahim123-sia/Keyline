import "server-only";
import type { ContentStatus } from "@/db/schema/content";
import { ActionError } from "@/lib/actions";
import { fieldError } from "./checks";
import type { ContentProblem, Publishing } from "./schema";

export function problemsError(
  message: string,
  code: string,
  problems: ContentProblem[],
): ActionError {
  const fieldErrors: Record<string, string[]> = {};
  for (const p of problems) (fieldErrors[p.field] ??= []).push(p.message);
  return new ActionError(message, code, fieldErrors);
}

/** While an item is published or scheduled, its publish rules hold on every save. */
export function assertLiveRules(
  status: ContentStatus,
  noun: string,
  problems: ContentProblem[],
): void {
  if (status === "draft" || problems.length === 0) return;
  throw problemsError(
    status === "published"
      ? `This ${noun} is published, so these must stay filled in. Fix them, or unpublish it first.`
      : `This ${noun} is scheduled, so these must stay filled in. Fix them, or unschedule it first.`,
    "LIVE_RULES",
    problems,
  );
}

/**
 * What a publishing action changes (08 §3): publish now (keeping the first publish date),
 * schedule for later (the cron publishes it) or take it off the site.
 */
export function publishingValues(
  input: Publishing,
  row: { publishedAt: Date | null },
  problems: ContentProblem[],
  now: Date,
): { status: ContentStatus; publishAt: Date | null; publishedAt?: Date } {
  if (input.action === "unpublish") return { status: "draft", publishAt: null };
  if (problems.length) throw problemsError("Not ready to publish yet.", "PUBLISH_RULES", problems);
  if (input.action === "publish")
    return { status: "published", publishAt: null, publishedAt: row.publishedAt ?? now };
  const at = new Date(input.publishAt);
  if (at.getTime() <= now.getTime() + 60_000)
    fieldError("publishAt", "Choose a time at least a minute from now, or publish now.");
  return { status: "scheduled", publishAt: at };
}
