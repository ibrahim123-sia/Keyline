import type { Metadata } from "next";
import { NewsletterButton } from "@/components/site/newsletter/newsletter-buttons";
import { getDb } from "@/db/client";
import { pendingByToken } from "@/features/newsletter/subscribe";
import { format } from "@/lib/i18n";
import { newsletter as t } from "@/lib/i18n/dictionaries/newsletter";

export const instant = false;
export const metadata: Metadata = { title: t.confirm.title, robots: { index: false } };

/** The double opt-in link from the confirmation email (05 §13). */
export default async function NewsletterConfirmPage(
  props: PageProps<"/newsletter/confirm/[token]">,
) {
  const { token } = await props.params;
  const pending = await pendingByToken(await getDb(), token);
  return (
    <div className="container-site flex max-w-xl flex-col gap-5 py-12">
      <h1 className="text-h2 text-ink">{t.confirm.title}</h1>
      {pending ? (
        <>
          <p className="text-[16px] text-text">
            {format(t.confirm.intro, { email: pending.email })}
          </p>
          <NewsletterButton kind="confirm" token={token} />
        </>
      ) : (
        <p className="text-[16px] text-text-muted">{t.confirm.invalid}</p>
      )}
    </div>
  );
}
