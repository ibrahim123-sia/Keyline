import type { Metadata } from "next";
import { OwnerRequestPage } from "@/components/site/valuation/owner-request-page";
import { valuation as t } from "@/lib/i18n/dictionaries/valuation";

export const metadata: Metadata = {
  title: t.listing.metaTitle,
  description: t.listing.metaDescription,
  alternates: { canonical: "/list-your-property" },
};

/** /list-your-property (11 §6): the owner's property, asking price and date, for an agent. */
export default function ListYourPropertyPage() {
  return <OwnerRequestPage kind="listing" />;
}
