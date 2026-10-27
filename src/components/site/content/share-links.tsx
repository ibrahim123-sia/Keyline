import { content } from "@/lib/i18n/dictionaries/content";
import { CopyLinkButton } from "./copy-link-button";

const pill =
  "inline-flex h-10 items-center rounded-full border border-ink/15 bg-surface px-4 text-[14px] font-semibold text-ink hover:border-ink/40";

/** Share buttons (06 §9): plain links to each network, and copy the link. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const t = content.share;
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const links = [
    { label: t.whatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { label: t.facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: t.x, href: `https://x.com/intent/post?url=${u}&text=${text}` },
    { label: t.linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  ];
  return (
    <section aria-labelledby="share-post" className="flex flex-col gap-3 print:hidden">
      <h2 id="share-post" className="text-[15px] font-semibold text-ink">
        {content.insights.share}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className={pill}>
              {l.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
        <li>
          <a href={`mailto:?subject=${text}&body=${u}`} className={pill}>
            {t.email}
          </a>
        </li>
        <li>
          <CopyLinkButton url={url} className={pill} />
        </li>
      </ul>
    </section>
  );
}
