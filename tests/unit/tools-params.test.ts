import { describe, expect, it } from "vitest";
import {
  downPaymentOf,
  incomeBandLabels,
  mortgageLinkFor,
  mortgageSearch,
  parseMortgageParams,
  parseRoiParams,
  roiInputOf,
  roiLinkFor,
  roiSearch,
  type MortgageDefaults,
  type RoiDefaultsSettings,
} from "@/features/tools/calculator-params";

const mortgageDefaults: MortgageDefaults = {
  downPaymentPct: 20,
  interestRatePct: 5,
  years: 25,
  maxLtvPct: 80,
  maxYears: 30,
  registrationFeePct: 4,
  agencyFeePct: 2,
  arrangementFeePct: 1,
  incomeBands: [1_500_000, 3_000_000],
};
const roiDefaults: RoiDefaultsSettings = {
  serviceChargePerArea: 1_500,
  managementFeePct: 20,
  occupancyPct: 70,
  purchaseCostsPct: 7,
  maintenancePct: 1,
  vacancyPct: 5,
  rentGrowthPct: 2,
  priceGrowthPct: 3,
};
const ctx = { decimals: 2, typicalPrice: 150_000_000 };

describe("mortgage share links", () => {
  it("starts from the Settings defaults and the typical price", () => {
    const s = parseMortgageParams({}, mortgageDefaults, ctx);
    expect(s).toMatchObject({
      price: 150_000_000,
      downMode: "pct",
      downPct: 20,
      years: 25,
      ratePct: 5,
      registrationFeePct: 4,
      ref: null,
    });
    expect(downPaymentOf(s, mortgageDefaults)).toBe(30_000_000);
  });

  it("reads a link and writes the same link back", () => {
    const q = "price=2300000&down=25&years=20&rate=4.25&reg=4&agency=2&arr=0.5&ref=HD-1001";
    const s = parseMortgageParams(new URLSearchParams(q), mortgageDefaults, ctx);
    expect(s).toMatchObject({ price: 230_000_000, downPct: 25, years: 20, ratePct: 4.25 });
    expect(mortgageSearch(s, 2)).toBe(q);
    // An amount instead of a percentage.
    const a = parseMortgageParams({ price: "1,000,000", dp: "300000" }, mortgageDefaults, ctx);
    expect(a).toMatchObject({ downMode: "amount", downAmount: 30_000_000 });
    expect(mortgageSearch(a, 2)).toContain("dp=300000");
  });

  it("keeps the inputs within the market's limits", () => {
    const s = parseMortgageParams(
      { price: "-5", down: "5", years: "99", rate: "abc", reg: "50", ref: "<script>" },
      mortgageDefaults,
      ctx,
    );
    expect(s).toMatchObject({
      price: 0,
      downPct: 20,
      years: 30,
      ratePct: 5,
      registrationFeePct: 20,
    });
    expect(s.ref).toBeNull();
    // 10% down is below the 80% loan-to-value limit: the down payment is lifted to 20%.
    const low = parseMortgageParams({ price: "1000000", dp: "100000" }, mortgageDefaults, ctx);
    expect(downPaymentOf(low, mortgageDefaults)).toBe(20_000_000);
  });

  it("builds the property page link", () => {
    expect(mortgageLinkFor({ price: 230_000_000, reference: "HD-1001" }, 2)).toBe(
      "/tools/mortgage?price=2300000&ref=HD-1001",
    );
  });
});

describe("rental return share links", () => {
  const typical = { price: 200_000_000, rentYearly: 14_000_000, size: 1_000 };

  it("starts from the Settings defaults and round-trips a holiday-home link", () => {
    const s = parseRoiParams({}, roiDefaults, mortgageDefaults, { decimals: 2, typical });
    expect(s).toMatchObject({
      price: 200_000_000,
      mode: "long",
      rentYearly: 14_000_000,
      size: 1_000,
      serviceChargePerArea: 1_500,
      purchaseCostsPct: 7,
      mortgageOn: false,
    });
    const q =
      "price=1500000&pc=6&mode=short&high=900&low=450.5&hs=5&occ=75&mgmt=22&sc=18&size=850&maint=1.5&mtg=1&down=30&rate=4.5&years=20&rg=1&pg=2&ref=HD-7";
    const p = parseRoiParams(new URLSearchParams(q), roiDefaults, mortgageDefaults, {
      decimals: 2,
      typical,
    });
    expect(p).toMatchObject({ nightlyLow: 45_050, highSeasonMonths: 5, mortgageOn: true });
    expect(roiSearch(p, 2)).toBe(q);
    expect(roiInputOf(p).mortgage).toEqual({ downPayment: 45_000_000, ratePct: 4.5, years: 20 });
  });

  it("keeps occupancy and the management fee in the simulator's ranges", () => {
    const s = parseRoiParams({ occ: "10", mgmt: "60" }, roiDefaults, mortgageDefaults, {
      decimals: 2,
      typical,
    });
    expect(s.occupancyPct).toBe(50);
    expect(s.managementFeePct).toBe(25);
  });

  it("builds the property page link from the listing", () => {
    expect(
      roiLinkFor(
        {
          price: 230_000_000,
          reference: "HD-1001",
          rentYearly: 15_000_000,
          size: 1_200,
          serviceChargePerArea: 1_550,
        },
        2,
      ),
    ).toBe("/tools/rental-returns?price=2300000&ref=HD-1001&rent=150000&size=1200&sc=15.5");
  });
});

describe("income bands", () => {
  it("names each band from the limits", () => {
    const words = { under: "Under {amount}", between: "{from} to {to}", over: "{amount} or more" };
    expect(incomeBandLabels([1_500_000, 3_000_000], (v) => String(v / 100), words)).toEqual([
      "Under 15000",
      "15000 to 30000",
      "30000 or more",
    ]);
    expect(incomeBandLabels([], String, words)).toEqual([]);
  });
});
