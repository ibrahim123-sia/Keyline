import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/site/listings/listing-card";
import { getDb } from "@/db/client";
import { accountCardContext } from "@/features/account/card-context";
import { sharedList } from "@/features/account/queries";
import { account, format } from "@/lib/i18n";

export const instant = false;
export const metadata: Metadata = { robots: { index: false } };

/** A customer's list shared by link (12 §2): the homes, no notes, never indexed. */
export default async function SharedListPage(props: PageProps<"/lists/[token]">) {
  const { token } = await props.params;
  const list = await sharedList(await getDb(), token);
  if (!list) notFound();
  const ctx = await accountCardContext();
  return (
    <div className="container-site flex flex-col gap-6 py-10">
      <h1 className="text-h1">{format(account.sharedList.title, { name: list.name })}</h1>
      {list.cards.length === 0 ? (
        <p className="text-text-muted">{account.sharedList.empty}</p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.cards.map((c) => (
            <li key={c.id}>
              <ListingCard listing={c} ctx={ctx} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
