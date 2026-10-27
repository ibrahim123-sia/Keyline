import "server-only";
import { revalidateTag } from "next/cache";

/**
 * Expires cache tags from background work (jobs, scheduled tasks). In a Next.js server this
 * is revalidateTag with immediate expiry; in a plain script (the seed, the local cron runner)
 * there is no cache in that process to expire, so it is skipped instead of failing the work.
 */
export function expireTags(...names: string[]): void {
  for (const name of names) {
    try {
      revalidateTag(name, { expire: 0 });
    } catch (err) {
      if (!(err instanceof Error && /static generation store missing/i.test(err.message)))
        throw err;
    }
  }
}
