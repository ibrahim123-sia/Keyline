import { BadgeCheckIcon, FileCheckIcon, HashIcon } from "lucide-react";
import { MediaImage } from "@/components/site/media-image";
import { PriceTag } from "@/components/site/price-tag";
import type { PublicListing } from "@/features/listings/public";
import { displayPrice } from "@/lib/currency-display";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";
import { areaUnitLabels, perAreaFromSqm } from "@/lib/units";
import { verifiedDate, type PageContext } from "./blocks";
import { ContactActions, type ContactInfo } from "./contact-actions";
import { InquiryForm } from "./inquiry-form";

const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * Sticky contact card (06 §5): price and price per area, the agent (or the agency), the
 * contact buttons, the inquiry form and the trust box.
 */
export function ContactCard({
  listing: l,
  ctx,
  info,
  agencyName,
}: {
  listing: PublicListing;
  ctx: PageContext;
  info: ContactInfo;
  agencyName: string;
}) {
  const perArea =
    l.price != null && l.size
      ? displayPrice(
          Math.round(perAreaFromSqm(l.price / l.size, ctx.areaUnit)),
          l.currency,
          ctx.visitorCurrency,
          ctx.rates,
        ).text
      : null;
  const a = l.agent;
  const live = l.status !== "sold" && l.status !== "rented";

  return (
    <aside aria-label={t.form.inquiryTitle} className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-soft">
        <div>
          <PriceTag
            price={l.price}
            currency={l.currency}
            visitorCurrency={ctx.visitorCurrency}
            rates={ctx.rates}
            period={l.purpose === "rent" ? l.pricePeriod : null}
            onRequestText={t.facts.onRequest}
            className="text-[24px]"
          />
          {perArea && l.purpose === "sale" && (
            <p className="text-[13.5px] text-text-muted tabular">
              {format(t.contact.perArea, { amount: perArea, unit: areaUnitLabels[ctx.areaUnit] })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-full bg-photo-placeholder">
            {a?.photoUrl && (
              <MediaImage src={a.photoUrl} alt="" sizes="56px" aspect="1 / 1" maxWidth={256} />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{a?.name ?? agencyName}</p>
            {a?.title && <p className="truncate text-[13px] text-text-muted">{a.title}</p>}
            {a && a.languages.length > 0 && (
              <p className="text-[13px] text-text-muted">
                {format(t.contact.languages, { list: listFormat.format(a.languages) })}
              </p>
            )}
            {a?.replyTimeText && <p className="text-[13px] text-success">{a.replyTimeText}</p>}
          </div>
        </div>

        {live && <ContactActions info={info} />}
      </div>

      {live && (
        <div className="rounded-[20px] bg-surface p-5 shadow-soft">
          <h2 className="mb-3 text-[17px] font-semibold text-ink">{t.form.inquiryTitle}</h2>
          <InquiryForm propertyId={l.id} reference={l.reference} kind="inquiry" />
        </div>
      )}

      <ul className="flex flex-col gap-2 rounded-[20px] border border-border p-4 text-[13.5px] text-text">
        {l.verifiedAt && (
          <li className="flex items-center gap-2 text-success">
            <BadgeCheckIcon className="size-4 shrink-0" aria-hidden />
            {format(t.contact.trustVerified, { date: verifiedDate(l.verifiedAt) })}
          </li>
        )}
        {ctx.permitsEnabled && l.permitNumber && (
          <li className="flex items-center gap-2">
            <FileCheckIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
            {ctx.permitLabel} {l.permitNumber}
          </li>
        )}
        <li className="flex items-center gap-2">
          <HashIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
          {format(t.contact.trustReference, { ref: l.reference })}
        </li>
      </ul>
    </aside>
  );
}
