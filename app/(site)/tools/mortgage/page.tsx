import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { CalculatorSkeleton } from "@/components/site/tools/calculator-skeleton";
import { MortgageCalculator } from "@/components/site/tools/mortgage-calculator";
import { getSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { typicalSale } from "@/features/tools/calculator-data";
import { incomeBandLabels, parseMortgageParams } from "@/features/tools/calculator-params";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: t.mortgage.metaTitle,
  description: t.mortgage.metaDescription,
  alternates: { canonical: "/tools/mortgage" },
};

/** /tools/mortgage (11 §1). The heading is static; the inputs come from the link. */
export default function MortgagePage(props: PageProps<"/tools/mortgage">) {
  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Breadcrumb
            items={[{ label: t.common.home, href: "/" }, { label: t.mortgage.title }]}
            baseUrl={siteOrigin()}
          />
          <h1 className="text-display">{t.mortgage.title}</h1>
          <p className="max-w-2xl text-lg text-text">{t.mortgage.intro}</p>
        </div>
        <Suspense fallback={<CalculatorSkeleton />}>
          <Calculator searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Calculator({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, market, typical] = await Promise.all([
    searchParams,
    getSettings("market"),
    typicalSale(),
  ]);
  const initial = parseMortgageParams(params, market.mortgage, {
    decimals: market.baseCurrency.decimals,
    typicalPrice: typical.price,
  });
  const bands = incomeBandLabels(
    market.mortgage.incomeBands,
    (v) => formatMoney(v, market.baseCurrency),
    {
      under: t.mortgage.preApproval.incomeUnder,
      between: t.mortgage.preApproval.incomeBetween,
      over: t.mortgage.preApproval.incomeOver,
    },
  );
  return (
    <MortgageCalculator
      initial={initial}
      defaults={market.mortgage}
      currency={market.baseCurrency}
      incomeBands={bands}
    />
  );
}
