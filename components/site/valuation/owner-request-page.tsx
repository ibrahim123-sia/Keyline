import { Breadcrumb } from "@/components/site/breadcrumb";
import { siteOrigin } from "@/features/site/url";
import { ownerFormOptions } from "@/features/valuation/options";
import type { OwnerRequestKind } from "@/features/valuation/schema";
import { pages } from "@/lib/i18n";
import { valuation as t } from "@/lib/i18n/dictionaries/valuation";
import { OwnerRequestForm } from "./owner-request-form";

/** /valuation and /list-your-property (11 §5-6): a short intro and the step-by-step form. */
export async function OwnerRequestPage({ kind }: { kind: OwnerRequestKind }) {
  const copy = kind === "valuation" ? t.valuation : t.listing;
  const options = await ownerFormOptions();
  return (
    <div className="section-y">
      <div className="container-site flex max-w-3xl flex-col gap-8">
        <Breadcrumb
          items={[{ label: pages.common.home, href: "/" }, { label: copy.title }]}
          baseUrl={siteOrigin()}
        />
        <header className="flex flex-col gap-3">
          <h1 className="text-display">{copy.title}</h1>
          <p className="text-lg leading-relaxed text-text">{copy.intro}</p>
        </header>
        <OwnerRequestForm kind={kind} options={options} />
      </div>
    </div>
  );
}
