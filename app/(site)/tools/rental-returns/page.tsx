import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/site/breadcrumb";
import { CalculatorSkeleton } from "@/components/site/tools/calculator-skeleton";
import { RoiSimulator } from "@/components/site/tools/roi-simulator";
import { getSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { typicalSale } from "@/features/tools/calculator-data";
import { parseRoiParams } from "@/features/tools/calculator-params";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";

export const metadata: Metadata = {
  title: t.roi.metaTitle,
  description: t.roi.metaDescription,
  alternates: { canonical: "/tools/rental-returns" },
};

/** /tools/rental-returns (11 §2). The heading is static; the inputs come from the link. */
export default function RentalReturnsPage(props: PageProps<"/tools/rental-returns">) {
  return (
    <div className="section-y">
      <div className="container-site flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <Breadcrumb
            items={[{ label: t.common.home, href: "/" }, { label: t.roi.title }]}
            baseUrl={siteOrigin()}
          />
          <h1 className="text-display">{t.roi.title}</h1>
          <p className="max-w-2xl text-lg text-text">{t.roi.intro}</p>
        </div>
        <Suspense fallback={<CalculatorSkeleton />}>
          <Simulator searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Simulator({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, market, typical] = await Promise.all([
    searchParams,
    getSettings("market"),
    typicalSale(),
  ]);
  const initial = parseRoiParams(params, market.roi, market.mortgage, {
    decimals: market.baseCurrency.decimals,
    typical,
  });
  return (
    <RoiSimulator
      initial={initial}
      roiDefaults={market.roi}
      mortgageDefaults={market.mortgage}
      currency={market.baseCurrency}
      areaUnit={market.areaUnit}
    />
  );
}
