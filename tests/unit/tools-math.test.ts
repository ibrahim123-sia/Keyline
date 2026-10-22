import { describe, expect, it } from "vitest";
import {
  amortisation,
  downPaymentFromPct,
  downPaymentPct,
  grossRentFirstYear,
  irr,
  maxLoan,
  minDownPayment,
  monthlyPayment,
  mortgage,
  rentalReturns,
  roundTo,
  yields,
  type RoiInput,
} from "@/features/tools/math";

// Amounts are minor units (2 decimals): 230_000_000 is 2,300,000.00.

describe("mortgage", () => {
  it("works out the repayment, interest, fees and upfront cash", () => {
    // 2,300,000 price, 20% down, 4.5% over 25 years.
    // r = 0.375%, n = 300: P = 1,840,000 × r / (1 − 1.00375^−300) = 10,227.3176 a month.
    const m = mortgage({
      price: 230_000_000,
      downPayment: 46_000_000,
      years: 25,
      ratePct: 4.5,
      registrationFeePct: 4,
      agencyFeePct: 2,
      arrangementFeePct: 1,
    });
    expect(m.loan).toBe(184_000_000);
    expect(m.ltvPct).toBe(80);
    expect(m.months).toBe(300);
    expect(m.monthlyPayment).toBe(1_022_732);
    // 300 × 10,227.3176 − 1,840,000 = 1,228,195.28
    expect(m.totalInterest).toBe(122_819_528);
    expect(m.totalRepaid).toBe(184_000_000 + 122_819_528);
    // Registration 4% and agency 2% of the price; arrangement 1% of the loan.
    expect(m.fees).toEqual({
      registration: 9_200_000,
      agency: 4_600_000,
      arrangement: 1_840_000,
      total: 15_640_000,
    });
    expect(m.upfrontCash).toBe(46_000_000 + 15_640_000);
    expect(m.totalCost).toBe(230_000_000 + 122_819_528 + 15_640_000);
    expect(m.schedule).toHaveLength(25);
  });

  it("matches a loan worked by hand: 10,000 at 12% over a year", () => {
    // r = 1%: P = 100 / (1 − 1.01^−12) = 888.4879; interest = 12 × P − 10,000 = 661.85.
    expect(monthlyPayment(1_000_000, 12, 1)).toBe(88_849);
    expect(amortisation(1_000_000, 12, 1)).toEqual([
      { year: 1, principal: 1_000_000, interest: 66_185, balance: 0 },
    ]);
  });

  it("splits each year into principal and interest that add up exactly", () => {
    // 24,000 at 6% over 2 years: P = 1,063.6946; after 12 payments 12,358.9958 is owed.
    const rows = amortisation(2_400_000, 6, 2);
    expect(rows).toEqual([
      { year: 1, principal: 1_164_100, interest: 112_333, balance: 1_235_900 },
      { year: 2, principal: 1_235_900, interest: 40_534, balance: 0 },
    ]);
    const long = amortisation(184_000_000, 4.5, 25);
    expect(long.reduce((s, y) => s + y.principal, 0)).toBe(184_000_000);
    expect(long.reduce((s, y) => s + y.interest, 0)).toBe(122_819_528);
    expect(long.at(-1)!.balance).toBe(0);
    // Interest falls and principal grows as the loan is paid down.
    expect(long[0]!.interest).toBeGreaterThan(long[1]!.interest);
    expect(long[0]!.principal).toBeLessThan(long[1]!.principal);
  });

  it("keeps the earlier repayment rule (property page mini calculator)", () => {
    expect(monthlyPayment(196_000_000, 5, 25)).toBe(1_145_796);
    expect(monthlyPayment(0, 5, 25)).toBe(0);
  });

  it("at 0% interest pays the loan back in equal parts", () => {
    expect(monthlyPayment(120_000, 0, 1)).toBe(10_000);
    const m = mortgage({ price: 460_000, downPayment: 100_000, years: 3, ratePct: 0 });
    expect(m.monthlyPayment).toBe(10_000);
    expect(m.totalInterest).toBe(0);
    expect(m.totalCost).toBe(460_000);
    expect(m.schedule.map((y) => [y.principal, y.interest, y.balance])).toEqual([
      [120_000, 0, 240_000],
      [120_000, 0, 120_000],
      [120_000, 0, 0],
    ]);
  });

  it("with 100% down there is no loan, no interest and no arrangement fee", () => {
    const m = mortgage({
      price: 100_000_000,
      downPayment: 100_000_000,
      years: 25,
      ratePct: 5,
      registrationFeePct: 4,
      arrangementFeePct: 1,
    });
    expect(m).toMatchObject({
      loan: 0,
      ltvPct: 0,
      monthlyPayment: 0,
      totalInterest: 0,
      upfrontCash: 104_000_000,
      totalCost: 104_000_000,
      schedule: [],
    });
    expect(m.fees.arrangement).toBe(0);
  });

  it("never lends more than the price or less than nothing", () => {
    expect(mortgage({ price: 1_000, downPayment: 5_000, years: 10, ratePct: 5 }).loan).toBe(0);
    expect(mortgage({ price: 1_000, downPayment: -50, years: 10, ratePct: 5 }).loan).toBe(1_000);
    expect(mortgage({ price: Number.NaN, downPayment: 0, years: 10, ratePct: 5 }).loan).toBe(0);
  });

  it("applies the loan-to-value limit", () => {
    expect(maxLoan(230_000_000, 80)).toBe(184_000_000);
    expect(minDownPayment(230_000_000, 80)).toBe(46_000_000);
    expect(minDownPayment(230_000_000, 100)).toBe(0);
    // 80.1% of 1,000.01 is 801.008…: the bank lends whole minor units below it.
    expect(maxLoan(100_001, 80.1)).toBe(80_100);
    expect(downPaymentFromPct(230_000_000, 20)).toBe(46_000_000);
    expect(downPaymentPct(230_000_000, 46_000_000)).toBe(20);
    expect(downPaymentPct(0, 10)).toBe(0);
  });
});

/** 2,000,000 home let for 140,000 a year, 1,000 area units at 15.00 a year service charge. */
const base: RoiInput = {
  price: 200_000_000,
  purchaseCostsPct: 4,
  mode: "long",
  rentYearly: 14_000_000,
  nightlyHigh: 0,
  nightlyLow: 0,
  highSeasonMonths: 6,
  occupancyPct: 70,
  managementFeePct: 20,
  serviceChargePerArea: 1_500,
  size: 1_000,
  maintenancePct: 1,
  vacancyPct: 5,
  mortgage: null,
  rentGrowthPct: 0,
  priceGrowthPct: 0,
};

describe("rental returns", () => {
  it("gives the yields and cash flow of a cash purchase", () => {
    const r = rentalReturns(base);
    // Gross: 140,000 / 2,000,000 = 7%.
    expect(r.grossYieldPct).toBeCloseTo(7, 10);
    // Income 140,000 × 95% = 133,000; costs 15,000 service + 20,000 maintenance;
    // net 98,000 over 2,080,000 (price + 4% purchase costs) = 4.7115%.
    expect(r.netCashFlowYear1).toBe(9_800_000);
    expect(r.netYieldPct).toBeCloseTo((9_800_000 / 208_000_000) * 100, 10);
    expect(r.purchaseCosts).toBe(8_000_000);
    expect(r.cashInvested).toBe(208_000_000);
    expect(r.cashOnCashPct).toBeCloseTo((9_800_000 / 208_000_000) * 100, 10);
    expect(r.years).toHaveLength(10);
    expect(r.years[4]).toMatchObject({
      year: 5,
      cumulativeCashFlow: 49_000_000,
      equity: 200_000_000,
      totalReturn: 41_000_000,
    });
    expect(r.years[9]).toMatchObject({
      year: 10,
      cumulativeCashFlow: 98_000_000,
      equity: 200_000_000,
      totalReturn: 90_000_000,
    });
    // −2,080,000 now, 98,000 a year, and the home (2,000,000) back after year 10: 4.397%.
    expect(r.irrPct).toBeCloseTo(4.397, 3);
    // 2,080,000 / 98,000 = 21.2 years of rent: paid back in year 22.
    expect(r.breakEvenYear).toBe(22);
  });

  it("grows rents, service charges and the value each year", () => {
    const r = rentalReturns({ ...base, rentGrowthPct: 2, priceGrowthPct: 3 });
    const [y1, y2] = r.years;
    expect(y1).toMatchObject({ grossRent: 14_000_000, value: 206_000_000 });
    // Year 2: rent 142,800, collected 135,660; service 15,300; maintenance 1% of 2,060,000.
    expect(y2).toMatchObject({
      grossRent: 14_280_000,
      income: 13_566_000,
      operatingCosts: 1_530_000 + 2_060_000,
      netCashFlow: 9_976_000,
      cumulativeCashFlow: 9_800_000 + 9_976_000,
      value: 212_180_000,
      equity: 212_180_000,
    });
    // Growth only adds to the return.
    expect(r.irrPct!).toBeGreaterThan(rentalReturns(base).irrPct!);
  });

  it("with a mortgage: repayments in the cash flow, the loan in the equity", () => {
    const r = rentalReturns({
      ...base,
      mortgage: { downPayment: 40_000_000, ratePct: 5, years: 25 },
    });
    const schedule = amortisation(160_000_000, 5, 25);
    expect(r.loan).toBe(160_000_000);
    // 20% down + 4% purchase costs.
    expect(r.cashInvested).toBe(48_000_000);
    // 12 × 9,353.4407 = 112,241.29 of repayments against 98,000: a negative cash flow.
    const repaid = schedule[0]!.principal + schedule[0]!.interest;
    expect(Math.abs(repaid - 11_224_129)).toBeLessThanOrEqual(1);
    expect(r.netCashFlowYear1).toBe(9_800_000 - repaid);
    expect(r.netCashFlowYear1).toBeLessThan(0);
    expect(r.cashOnCashPct!).toBeLessThan(0);
    expect(r.years[0]!.loanBalance).toBe(schedule[0]!.balance);
    expect(r.years[9]!.equity).toBe(200_000_000 - schedule[9]!.balance);
    // The net yield ignores financing.
    expect(r.netYieldPct).toBeCloseTo(rentalReturns(base).netYieldPct, 10);
    // 25 years at a loss of 35,603.22 in all (245,000 − 2,806,032.20 repaid), then 98,000 a
    // year: the 480,000 put in is back in year 34.
    expect(r.breakEvenYear).toBe(34);
    // A small stake in a home that keeps its value: the IRR is still positive.
    expect(r.irrPct!).toBeGreaterThan(0);
  });

  it("short-term letting: nightly rates, occupancy and the manager's fee", () => {
    const input = {
      ...base,
      mode: "short" as const,
      nightlyHigh: 80_000,
      nightlyLow: 50_000,
      highSeasonMonths: 6,
      occupancyPct: 70,
      managementFeePct: 20,
    };
    // 365 nights × 70% × 650 average = 166,075 of bookings.
    expect(grossRentFirstYear(input)).toBeCloseTo(16_607_500, 6);
    const r = rentalReturns(input);
    expect(r.grossRentYear1).toBe(16_607_500);
    expect(r.grossYieldPct).toBeCloseTo(8.30375, 10);
    // Vacancy does not apply; the manager takes 20% (33,215); service and maintenance as before.
    expect(r.years[0]).toMatchObject({
      income: 16_607_500,
      operatingCosts: 3_321_500 + 1_500_000 + 2_000_000,
      netCashFlow: 9_786_000,
    });
    expect(r.netYieldPct).toBeCloseTo((9_786_000 / 208_000_000) * 100, 10);
    // All high season.
    expect(grossRentFirstYear({ ...input, highSeasonMonths: 12 })).toBeCloseTo(20_440_000, 6);
  });

  it("with no rent, only costs: negative yield and cash flow, never breaks even", () => {
    const r = rentalReturns({ ...base, rentYearly: 0 });
    expect(r.grossYieldPct).toBe(0);
    expect(r.netCashFlowYear1).toBe(-3_500_000);
    expect(r.netYieldPct).toBeLessThan(0);
    expect(r.breakEvenYear).toBeNull();
    // −2,080,000, then −35,000 a year and 2,000,000 back after year 10: about −2.105%.
    expect(r.irrPct).toBeCloseTo(-2.105, 3);
  });

  it("a free home or a missing price gives zeros, not NaN", () => {
    const r = rentalReturns({ ...base, price: 0, rentYearly: 0, serviceChargePerArea: 0 });
    expect(r.grossYieldPct).toBe(0);
    expect(r.netYieldPct).toBe(0);
    expect(r.cashOnCashPct).toBeNull();
    expect(r.irrPct).toBeNull();
    expect(r.breakEvenYear).toBeNull();
    expect(r.years.every((y) => Number.isFinite(y.totalReturn))).toBe(true);
  });

  it("the listing page yields are the simulator's first year", () => {
    const y = yields(
      { price: 200_000_000, rentYearly: 14_000_000, serviceChargePerArea: 15_000, size: 100 },
      { vacancyPct: 5, maintenancePct: 1, purchaseCostsPct: 4 },
    );
    // Gross 7%. Net: (13,300,000 − 1,500,000 − 2,000,000) / 208,000,000 = 4.7%.
    expect(y).toEqual({ gross: 7, net: 4.7 });
    expect(
      yields(
        { price: 200_000_000, rentYearly: 14_000_000, serviceChargePerArea: null, size: null },
        { vacancyPct: 0, maintenancePct: 0, purchaseCostsPct: 0 },
      ),
    ).toEqual({ gross: 7, net: 7 });
  });
});

describe("irr", () => {
  it("finds the rate that brings the flows to zero", () => {
    expect(irr([-100, 110])).toBeCloseTo(10, 8);
    expect(irr([-1_000, 0, 1_210])).toBeCloseTo(10, 8);
    expect(irr([-100, 100])).toBeCloseTo(0, 8);
    expect(irr([-100, 50])).toBeCloseTo(-50, 6);
    // Worked by bisection: 8.8963%.
    expect(irr([-1_000, 300, 400, 500])).toBeCloseTo(8.8963, 4);
  });

  it("has no answer when the flows never change sign", () => {
    expect(irr([100, 200, 300])).toBeNull();
    expect(irr([-100, -50, -10])).toBeNull();
    expect(irr([0, 0, 0])).toBeNull();
    expect(irr([-100])).toBeNull();
    expect(irr([-100, Number.NaN])).toBeNull();
  });

  it("copes with a very high return", () => {
    expect(irr([-1, 100])).toBeCloseTo(9_900, 4);
  });
});

describe("roundTo", () => {
  it("rounds halves away from zero for display", () => {
    expect(roundTo(4.65, 1)).toBe(4.7);
    expect(roundTo(4.7115, 1)).toBe(4.7);
    expect(roundTo(-2.105, 2)).toBe(-2.11);
  });
});
