import { z } from "zod";

export const savedViewTables = ["properties", "projects", "leads", "contacts"] as const;
export type SavedViewTable = (typeof savedViewTables)[number];

/** Paging and the search box are not part of a view; everything else in the URL is. */
const ignoredParams = new Set(["page", "size", "q"]);

export function viewQuery(params: URLSearchParams): string {
  const kept = new URLSearchParams();
  for (const [k, v] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b)))
    if (!ignoredParams.has(k) && v) kept.append(k, v);
  return kept.toString();
}

export const saveViewSchema = z
  .object({
    tableId: z.enum(savedViewTables),
    name: z.string().trim().min(1, "Name the view").max(40, "Use at most 40 characters"),
    query: z
      .string()
      .max(1000)
      .transform((q) => viewQuery(new URLSearchParams(q)))
      .refine((q) => q.length > 0, "Choose some filters first"),
  })
  .strict();

export type SavedView = { id: string; name: string; query: string };
