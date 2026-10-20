import { account } from "./dictionaries/account";
import { admin } from "./dictionaries/admin";
import { site } from "./dictionaries/site";

/**
 * English only for now, i18n-ready (01 §1.5): every UI string lives in a dictionary per area.
 * A second language adds `dictionaries/<area>.<lang>.ts` with the same shape.
 */
export const dictionaries = { site, account, admin } as const;
export type Area = keyof typeof dictionaries;

export { site, account, admin };

/** Replaces `{name}` placeholders. Unknown placeholders are left as is. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
