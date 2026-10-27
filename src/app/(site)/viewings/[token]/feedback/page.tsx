import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedbackForm } from "@/components/site/viewings/feedback-form";
import { getDb } from "@/db/client";
import { viewingByToken } from "@/features/viewings/manage";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";

export const instant = false;
export const metadata: Metadata = { title: t.feedback.title, robots: { index: false } };

/** "How was the viewing?" from the link in the feedback email (09 §5). */
export default async function ViewingFeedbackPage(props: PageProps<"/viewings/[token]/feedback">) {
  const { token } = await props.params;
  const row = await viewingByToken(await getDb(), token);
  if (!row) notFound();
  const v = row.viewing;
  const what = row.property
    ? `${row.property.reference} · ${row.property.title}`
    : (row.project?.name ?? "");
  const open = v.status !== "cancelled" && v.startsAt <= new Date();
  return (
    <div className="container-site flex max-w-xl flex-col gap-6 py-10">
      <div>
        <h1 className="text-h2 text-ink">{t.feedback.title}</h1>
        <p className="mt-1 text-[15px] text-text-muted">{what}</p>
      </div>
      {v.feedbackRating ? (
        <p className="text-[15px] text-text">{t.feedback.thanks}</p>
      ) : open ? (
        <FeedbackForm token={token} />
      ) : (
        <p className="text-[15px] text-text-muted">{t.feedback.early}</p>
      )}
    </div>
  );
}
