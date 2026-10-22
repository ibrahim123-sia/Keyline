import { getDb } from "@/db/client";
import { toursOf, type TourView } from "@/features/account/queries";
import { loadSettings } from "@/features/settings/queries";
import { viewingTimes } from "@/features/viewings/notify";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account, format } from "@/lib/i18n";
import { viewings as vt } from "@/lib/i18n/dictionaries/viewings";

export const metadata = { title: account.nav.tours };
export const instant = false;

const t = account.toursPage;

function Tour({ v, timeZone, past }: { v: TourView; timeZone: string; past?: boolean }) {
  const { when } = viewingTimes(v.startsAt, null, timeZone);
  return (
    <li className="flex flex-col gap-2 rounded-[20px] bg-surface p-5 shadow-soft">
      <p className="font-semibold text-ink">
        {v.href ? (
          <a href={v.href} className="hover:underline">
            {v.what}
          </a>
        ) : (
          v.what
        )}
      </p>
      <p className="text-[14.5px] text-text">
        {when} · {v.type === "video" ? t.video : t.inPerson} ·{" "}
        {vt.manage.status[v.status as keyof typeof vt.manage.status] ?? v.status}
      </p>
      <div className="flex flex-wrap gap-3 text-[14px] font-semibold">
        {!past && (
          <>
            <a
              href={`/viewings/${v.token}`}
              className="text-accent underline-offset-4 hover:underline"
            >
              {t.manage}
            </a>
            <a
              href={`/api/viewings/${v.token}/ics`}
              className="text-accent underline-offset-4 hover:underline"
            >
              {t.calendar}
            </a>
          </>
        )}
        {past &&
          v.status !== "cancelled" &&
          (v.feedbackRating ? (
            <span className="text-text-muted">{format(t.rated, { rating: v.feedbackRating })}</span>
          ) : (
            <a
              href={`/viewings/${v.token}/feedback`}
              className="text-accent underline-offset-4 hover:underline"
            >
              {t.feedback}
            </a>
          ))}
      </div>
    </li>
  );
}

/** Tours (12 §2): upcoming and past viewings; change, cancel, calendar, feedback. */
export default async function ToursPage() {
  const user = await requireCustomerPage();
  const db = await getDb();
  const [{ upcoming, past }, general] = [
    await toursOf(db, user.id),
    await loadSettings("general", db),
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t.title}</h1>
      {upcoming.length === 0 && past.length === 0 && <p className="text-text-muted">{t.none}</p>}
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming" className="flex flex-col gap-3">
          <h2 id="upcoming" className="text-h3">
            {t.upcoming}
          </h2>
          <ul className="flex flex-col gap-3">
            {upcoming.map((v) => (
              <Tour key={v.id} v={v} timeZone={general.timeZone} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="past" className="flex flex-col gap-3">
          <h2 id="past" className="text-h3">
            {t.past}
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((v) => (
              <Tour key={v.id} v={v} timeZone={general.timeZone} past />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
