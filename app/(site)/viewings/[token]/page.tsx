import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageViewing } from "@/components/site/viewings/manage-viewing";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { viewingByToken } from "@/features/viewings/manage";
import { viewingTimes } from "@/features/viewings/notify";
import { viewings as t } from "@/lib/i18n/dictionaries/viewings";

export const instant = false;
export const metadata: Metadata = { title: t.manage.title, robots: { index: false } };

/** A viewing's private page (09 §5): what and when, and move or cancel without a login. */
export default async function ViewingPage(props: PageProps<"/viewings/[token]">) {
  const { token } = await props.params;
  const db = await getDb();
  const row = await viewingByToken(db, token);
  if (!row) notFound();
  const { viewing: v, property, project } = row;
  const general = await loadSettings("general", db);
  const { when, agencyTime } = viewingTimes(v.startsAt, v.visitorTimeZone, general.timeZone);
  const page = property
    ? `/property/${property.slug}`
    : project
      ? `/projects/${project.slug}`
      : "/";
  const what = property ? `${property.reference} · ${property.title}` : (project?.name ?? "");
  const open = (v.status === "confirmed" || v.status === "requested") && v.startsAt > new Date();

  return (
    <div className="container-site flex max-w-xl flex-col gap-6 py-10">
      <h1 className="text-h2 text-ink">{t.manage.title}</h1>
      <dl className="grid gap-3 rounded-[20px] bg-surface p-5 text-[15px] shadow-soft sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold text-ink">{t.manage.what}</dt>
        <dd>
          <a href={page} className="underline-offset-4 hover:underline">
            {what}
          </a>
        </dd>
        <dt className="font-semibold text-ink">{t.manage.when}</dt>
        <dd>
          {when}
          {agencyTime}
        </dd>
        <dt className="font-semibold text-ink">{t.manage.how}</dt>
        <dd>
          {v.type === "video" ? "Video tour" : "In person"}
          {v.meetingUrl && (
            <>
              {" · "}
              <a href={v.meetingUrl} className="underline-offset-4 hover:underline">
                {v.meetingUrl}
              </a>
            </>
          )}
        </dd>
        <dt className="font-semibold text-ink">Status</dt>
        <dd>{t.manage.status[v.status]}</dd>
      </dl>
      {open ? (
        <ManageViewing token={token} bookUrl={page} />
      ) : v.status !== "cancelled" && v.startsAt <= new Date() ? (
        <a
          href={`/viewings/${token}/feedback`}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {t.feedback.title}
        </a>
      ) : v.status === "cancelled" ? (
        <a href={page} className="font-semibold text-accent underline-offset-4 hover:underline">
          {t.manage.bookAgain}
        </a>
      ) : (
        <p className="text-[14px] text-text-muted">{t.manage.locked}</p>
      )}
    </div>
  );
}
