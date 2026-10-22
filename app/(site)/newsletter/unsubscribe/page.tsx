import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { NewsletterButton } from "@/components/site/newsletter/newsletter-buttons";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { newsletterSubscribers } from "@/db/schema/crm";
import { unsubscribeToken } from "@/features/newsletter/subscribe";
import { format } from "@/lib/i18n";
import { newsletter as t } from "@/lib/i18n/dictionaries/newsletter";
import { timingSafeEqual } from "@/lib/crypto";

export const instant = false;
export const metadata: Metadata = { title: t.unsubscribe.title, robots: { index: false } };

/** The unsubscribe link in every newsletter email: one click on this page, no login. */
export default async function NewsletterUnsubscribePage(
  props: PageProps<"/newsletter/unsubscribe">,
) {
  const sp = await props.searchParams;
  const id = typeof sp.u === "string" ? sp.u : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const valid =
    /^[0-9a-f-]{36}$/i.test(id) &&
    token !== "" &&
    timingSafeEqual(token, await unsubscribeToken(id));
  const [row] = valid
    ? await (
        await getDb()
      )
        .select({
          email: newsletterSubscribers.email,
          unsubscribedAt: newsletterSubscribers.unsubscribedAt,
        })
        .from(newsletterSubscribers)
        .where(
          and(
            eq(newsletterSubscribers.agencyId, currentAgencyId()),
            eq(newsletterSubscribers.id, id),
          ),
        )
    : [];
  return (
    <div className="container-site flex max-w-xl flex-col gap-5 py-12">
      <h1 className="text-h2 text-ink">{t.unsubscribe.title}</h1>
      {!row ? (
        <p className="text-[16px] text-text-muted">{t.unsubscribe.invalid}</p>
      ) : row.unsubscribedAt ? (
        <p className="text-[16px] text-text">{t.unsubscribe.done}</p>
      ) : (
        <>
          <p className="text-[16px] text-text">
            {format(t.unsubscribe.intro, { email: row.email })}
          </p>
          <NewsletterButton kind="unsubscribe" id={id} token={token} />
        </>
      )}
    </div>
  );
}
