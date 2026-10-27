/**
 * How redirect addresses are compared (08 §6): lowercased, decoded, without a trailing slash
 * and without the site's own origin. Pure and dependency-free: the middleware uses it too.
 */
export function normalizePath(path: string): string {
  let p = path.trim();
  try {
    if (/^https?:\/\//i.test(p)) {
      const url = new URL(p);
      p = url.pathname + url.search;
    }
  } catch {
    /* keep as typed */
  }
  try {
    p = decodeURI(p);
  } catch {
    /* malformed escapes: keep as typed */
  }
  if (!p.startsWith("/")) p = `/${p}`;
  const [pathname = "/", query] = splitQuery(p);
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (query ? `${clean}?${query}` : clean).toLowerCase();
}

/** "/a?b=1" -> ["/a", "b=1"]; the query is undefined when there is none. */
export function splitQuery(path: string): [string, string | undefined] {
  const at = path.indexOf("?");
  if (at < 0) return [path, undefined];
  const query = path.slice(at + 1);
  return [path.slice(0, at), query || undefined];
}

export type RedirectRule = { id: string; to: string; status: number };

/**
 * The rule for a requested address: the exact address with its query first, then the bare
 * address (which keeps the visitor's query, e.g. campaign tags, unless the target has one).
 */
export function matchRedirect(
  rules: ReadonlyMap<string, RedirectRule>,
  rawPath: string,
): { rule: RedirectRule; to: string } | null {
  const full = normalizePath(rawPath);
  const [bare, query] = splitQuery(full);
  const exact = rules.get(full);
  if (exact) return { rule: exact, to: exact.to };
  const rule = query ? rules.get(bare) : undefined;
  if (!rule) return null;
  const original = splitQuery(rawPath.trim())[1];
  return { rule, to: original && !rule.to.includes("?") ? `${rule.to}?${original}` : rule.to };
}
