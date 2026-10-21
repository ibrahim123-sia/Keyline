import { ArrowRightIcon } from "lucide-react";
import { getAnnouncement } from "@/features/website/site";
import { site } from "@/lib/i18n";

/** Optional bar above the header (08 §2), from Website -> Menus -> Announcement bar. */
export async function AnnouncementBar() {
  const a = await getAnnouncement();
  if (!a) return null;
  return (
    <div className="bg-ink text-surface" role="region" aria-label={site.a11y.announcement}>
      <p className="container-site flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-[14px] leading-snug">
        <span>{a.text}</span>
        {a.link && (
          <a
            href={a.link.href}
            className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline"
          >
            {a.link.label}
            <ArrowRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
          </a>
        )}
      </p>
    </div>
  );
}
