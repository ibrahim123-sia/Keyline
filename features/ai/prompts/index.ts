import { promptSources, type PromptName } from "./bundle.generated";

export type { PromptName };
export { promptNames } from "./bundle.generated";

/**
 * Prompt files (features/ai/prompts/*.md, 10 §6), bundled at build time by
 * `pnpm ai:prompts`. A prompt starts with an HTML comment for maintainers (what it is for,
 * its variables); that comment never reaches the model.
 */

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** The prompt text without its maintainer comment. */
export function promptTemplate(name: PromptName): string {
  return promptSources[name].replace(/^\s*<!--[\s\S]*?-->\s*/, "").trim();
}

/** Variable names a prompt uses, in order of first use. */
export function promptVariables(template: string): string[] {
  return [...new Set([...template.matchAll(VARIABLE)].map((m) => m[1]!))];
}

export type PromptVars = Record<string, string | number | boolean | string[] | null | undefined>;

function render(value: PromptVars[string]): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "(none)";
  if (value === null || value === undefined || value === "") return "(none)";
  return String(value);
}

export class PromptVariableError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Prompt variables missing: ${missing.join(", ")}`);
    this.name = "PromptVariableError";
  }
}

/**
 * Fills `{{name}}` placeholders. Every placeholder must have a value (a typo should fail
 * loudly in tests, not reach the model as "{{agncyName}}"); lists are joined with commas and
 * empty values become "(none)". Values are inserted once: a value containing "{{x}}" is not
 * filled again.
 */
export function fillPrompt(template: string, vars: PromptVars): string {
  const missing = promptVariables(template).filter((v) => !(v in vars));
  if (missing.length) throw new PromptVariableError(missing);
  return template.replace(VARIABLE, (_, key: string) => render(vars[key]));
}

/** A bundled prompt, filled. */
export function prompt(name: PromptName, vars: PromptVars = {}): string {
  return fillPrompt(promptTemplate(name), vars);
}
