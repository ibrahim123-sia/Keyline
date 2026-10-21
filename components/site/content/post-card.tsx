import { MediaImage } from "@/components/site/media-image";
import type { PostCardData } from "@/features/blog/public";
import { format } from "@/lib/i18n";
import { content } from "@/lib/i18n/dictionaries/content";

/** "21 October 2026" in the agency's time zone. */
export function postDate(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(iso),
    );
  }
}

/** A post in a list (06 §9): cover, category, title, excerpt, date and reading time. */
export function PostCard({
  post: p,
  timeZone,
  priority,
  headingLevel = 3,
}: {
  post: PostCardData;
  timeZone: string;
  priority?: boolean;
  headingLevel?: 2 | 3;
}) {
  const t = content.insights;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-[20px] bg-surface shadow-soft transition-shadow hover:shadow-md">
      {p.cover ? (
        <MediaImage
          src={p.cover.url}
          alt=""
          aspect="16 / 10"
          sizes="(min-width: 1280px) 400px, (min-width: 768px) 50vw, 100vw"
          color={p.cover.dominantColor}
          priority={priority}
          maxWidth={1080}
        />
      ) : (
        <div className="aspect-[16/10] w-full bg-photo-placeholder" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {p.category && (
          <p className="text-[12.5px] font-semibold tracking-wide text-accent uppercase">
            {p.category.name}
          </p>
        )}
        <Heading className="font-display text-[19px] leading-snug font-medium text-ink md:text-[21px]">
          <a
            href={`/insights/${p.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {p.title}
          </a>
        </Heading>
        {p.excerpt && <p className="line-clamp-3 text-[15px] text-text">{p.excerpt}</p>}
        <p className="mt-auto pt-1 text-[13px] text-text-muted">
          <time dateTime={p.publishedAt}>{postDate(p.publishedAt, timeZone)}</time> ·{" "}
          {format(t.readingTime, { minutes: p.readingMinutes })}
        </p>
      </div>
    </article>
  );
}
