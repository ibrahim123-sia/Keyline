import "server-only";
import { updateTag } from "next/cache";
import { embedAfterChange } from "@/features/ai/embeddings";
import { tags } from "@/lib/cache-tags";

/**
 * Expires what shows a page after an admin change (Server Actions only; the schedule cron
 * uses expireTags). Draft changes only show in the preview, which is never cached.
 */
export function revalidatePage(
  id: string,
  opts: { redirects?: boolean; draftOnly?: boolean } = {},
): void {
  if (opts.draftOnly) return;
  embedAfterChange("page", [id]);
  updateTag(tags.page(id));
  updateTag(tags.pages);
  updateTag(tags.sitemap);
  if (opts.redirects) updateTag(tags.redirects);
}
