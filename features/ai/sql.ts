/**
 * A Postgres array literal ("{a,b}") for one query parameter. Drizzle's sql template expands a
 * JS array into a list of parameters, which cannot be cast to an array type; this keeps the
 * whole list in one parameter. Only for ids and keys (letters, digits, "-", ":", "_").
 */
export function pgArrayLiteral(values: readonly string[]): string {
  for (const v of values)
    if (!/^[\w:-]+$/.test(v)) throw new Error(`Unsafe value in an array parameter: ${v}`);
  return `{${values.join(",")}}`;
}
