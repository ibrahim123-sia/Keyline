/**
 * All the maths of the buyer and investor tools (11 intro): the mortgage calculator, the
 * rental return (ROI) simulator, the property page's mini calculators and, later, the
 * assistant's `mortgage_estimate` and `rental_return` tools (10 §1) call these functions, so
 * every screen shows the same numbers. Pure and client-safe (no imports).
 *
 * Money is in minor units of one currency (cents, fils): whole numbers in, whole numbers out.
 * Sums are worked in floating point and each figure is rounded once, at the end. Percentages
 * are plain numbers (5 means 5%).
 */

const MONTHS_PER_YEAR = 12;
const NIGHTS_PER_YEAR = 365;
/** How far the break-even search looks. */
export const BREAK_EVEN_HORIZON_YEARS = 50;

const share = (pct: number) => pct / 100;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/* Mortgage ------------------------------------------------------------------- */

/** The exact monthly repayment of an annuity loan: P × r / (1 − (1 + r)^−n). */
function exactPayment(loan: number, monthlyRate: number, months: number): number {
  if (months <= 0 || loan <= 0) return 0;
  if (monthlyRate === 0) return loan / months;
  return (loan * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

/** What is still owed after `paid` monthly repayments (exact). */
function exactBalance(loan: number, monthlyRate: number, payment: number, paid: number): number {
  if (monthlyRate === 0) return Math.max(0, loan - payment * paid);
  const growth = (1 + monthlyRate) ** paid;
  return Math.max(0, loan * growth - (payment * (growth - 1)) / monthlyRate);
}

const monthsOf = (years: number) => Math.max(0, Math.round(years * MONTHS_PER_YEAR));

/** Monthly repayment of a loan (annuity), rounded to a whole minor unit. */
export function monthlyPayment(loan: number, ratePct: number, years: number): number {
  return Math.round(exactPayment(loan, share(ratePct) / MONTHS_PER_YEAR, monthsOf(years)));
}

/** The largest loan the market's loan-to-value limit allows on a price. */
export function maxLoan(price: number, maxLtvPct: number): number {
  // Multiply before dividing (exact for whole percentages); the epsilon absorbs 80.1 × …
  return Math.max(0, Math.floor((price * clamp(maxLtvPct, 0, 100)) / 100 + 1e-6));
}

/** The smallest down payment the loan-to-value limit allows. */
export function minDownPayment(price: number, maxLtvPct: number): number {
  return Math.max(0, price - maxLoan(price, maxLtvPct));
}

/** A down payment typed as a percentage of the price, in minor units. */
export function downPaymentFromPct(price: number, pct: number): number {
  return Math.round(price * share(clamp(pct, 0, 100)));
}

/** A down payment as a percentage of the price. */
export function downPaymentPct(price: number, downPayment: number): number {
  return price > 0 ? (clamp(downPayment, 0, price) / price) * 100 : 0;
}

export type AmortisationYear = {
  year: number;
  /** Paid off the loan this year. */
  principal: number;
  interest: number;
  /** Still owed at the end of the year. */
  balance: number;
};

/**
 * The loan year by year. Each year's figures are differences of rounded running totals, so
 * the principal adds up to the loan and the interest to the total interest exactly.
 */
export function amortisation(loan: number, ratePct: number, years: number): AmortisationYear[] {
  const months = monthsOf(years);
  if (loan <= 0 || months <= 0) return [];
  const rate = share(ratePct) / MONTHS_PER_YEAR;
  const payment = exactPayment(loan, rate, months);
  const rows: AmortisationYear[] = [];
  let principalBefore = 0;
  let interestBefore = 0;
  for (let year = 1; (year - 1) * MONTHS_PER_YEAR < months; year++) {
    const paid = Math.min(months, year * MONTHS_PER_YEAR);
    const owed = paid === months ? 0 : exactBalance(loan, rate, payment, paid);
    const principalSoFar = Math.round(loan - owed);
    const interestSoFar = Math.round(payment * paid - (loan - owed));
    rows.push({
      year,
      principal: principalSoFar - principalBefore,
      interest: interestSoFar - interestBefore,
      balance: loan - principalSoFar,
    });
    principalBefore = principalSoFar;
    interestBefore = interestSoFar;
  }
  return rows;
}

export type MortgageInput = {
  price: number;
  downPayment: number;
  years: number;
  ratePct: number;
  /** Of the price (land department or title registration). */
  registrationFeePct?: number;
  /** Of the price (the agency's commission). */
  agencyFeePct?: number;
  /** Of the loan (the bank's arrangement fee). */
  arrangementFeePct?: number;
};

export type MortgageResult = {
  price: number;
  /** Clamped to 0 – price. */
  downPayment: number;
  loan: number;
  ltvPct: number;
  months: number;
  monthlyPayment: number;
  totalInterest: number;
  /** Loan + interest: everything paid to the bank over the term. */
  totalRepaid: number;
  fees: { registration: number; agency: number; arrangement: number; total: number };
  /** Down payment + fees: the cash needed on the day. */
  upfrontCash: number;
  /** Price + interest + fees: what the home costs in the end. */
  totalCost: number;
  schedule: AmortisationYear[];
};

/** The mortgage calculator (11 §1): repayment, interest, fees, upfront cash and the schedule. */
export function mortgage(input: MortgageInput): MortgageResult {
  const price = Math.max(0, Math.round(finite(input.price)));
  const downPayment = clamp(Math.round(finite(input.downPayment)), 0, price);
  const loan = price - downPayment;
  const months = monthsOf(finite(input.years));
  const schedule = amortisation(loan, finite(input.ratePct), months / MONTHS_PER_YEAR);
  const totalInterest = schedule.reduce((sum, y) => sum + y.interest, 0);
  const registration = Math.round(price * share(finite(input.registrationFeePct ?? 0)));
  const agency = Math.round(price * share(finite(input.agencyFeePct ?? 0)));
  const arrangement = Math.round(loan * share(finite(input.arrangementFeePct ?? 0)));
  const feesTotal = registration + agency + arrangement;
  return {
    price,
    downPayment,
    loan,
    ltvPct: ratio(loan, price) * 100,
    months,
    monthlyPayment: monthlyPayment(loan, finite(input.ratePct), months / MONTHS_PER_YEAR),
    totalInterest,
    totalRepaid: loan + totalInterest,
    fees: { registration, agency, arrangement, total: feesTotal },
    upfrontCash: downPayment + feesTotal,
    totalCost: price + totalInterest + feesTotal,
    schedule,
  };
}

/* Rental return (ROI) ------------------------------------------------------------ */

export type RentalMode = "long" | "short";

export type RoiInput = {
  price: number;
  /** Paid on top of the price at purchase (registration, agency, legal). */
  purchaseCostsPct: number;
  mode: RentalMode;
  /** Long-term letting: the first year's rent. */
  rentYearly: number;
  /** Short-term letting: nightly rates in high and low season. */
  nightlyHigh: number;
  nightlyLow: number;
  /** Months of the year that are high season (0–12). */
  highSeasonMonths: number;
  /** Short-term: share of nights booked. */
  occupancyPct: number;
  /** Short-term: the holiday-home manager's share of the bookings. */
  managementFeePct: number;
  /** Per area unit a year; `size` is in the same unit. */
  serviceChargePerArea: number;
  size: number;
  /** Of the home's value, each year. */
  maintenancePct: number;
  /** Long-term: share of the rent lost to empty months between tenants. */
  vacancyPct: number;
  /** Bought with a mortgage, or null for cash. */
  mortgage: { downPayment: number; ratePct: number; years: number } | null;
  /** Rents (and service charges) rise by this much a year. */
  rentGrowthPct: number;
  /** The home's value rises by this much a year. */
  priceGrowthPct: number;
};

export type RoiYear = {
  year: number;
  /** Rent before vacancy (long-term) or bookings before the manager's fee (short-term). */
  grossRent: number;
  /** What is actually collected: gross rent less the vacancy allowance. */
  income: number;
  /** Service charge, maintenance and the management fee. */
  operatingCosts: number;
  mortgagePayments: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  /** The home's value at the end of the year. */
  value: number;
  loanBalance: number;
  /** Value less what is still owed. */
  equity: number;
  /** Cumulative cash flow + equity − cash invested: the gain if sold at the end of the year. */
  totalReturn: number;
};

export type RoiResult = {
  loan: number;
  purchaseCosts: number;
  /** Down payment (or the price, for cash) plus purchase costs. */
  cashInvested: number;
  grossRentYear1: number;
  grossYieldPct: number;
  /** Year one income after costs, over the price plus purchase costs. */
  netYieldPct: number;
  netCashFlowYear1: number;
  /** Year one net cash flow over the cash invested; null when nothing was invested. */
  cashOnCashPct: number | null;
  /** One row per year of the horizon (10 by default). */
  years: RoiYear[];
  /** Internal rate of return over the horizon, selling at its end; null when it has none. */
  irrPct: number | null;
  /**
   * The first year in which the cash flow collected adds up to the cash invested (without
   * selling); null when that does not happen within BREAK_EVEN_HORIZON_YEARS.
   */
  breakEvenYear: number | null;
};

/** The first year's gross rent: the yearly rent, or the year's bookings for holiday lets. */
export function grossRentFirstYear(
  input: Pick<
    RoiInput,
    "mode" | "rentYearly" | "nightlyHigh" | "nightlyLow" | "highSeasonMonths" | "occupancyPct"
  >,
): number {
  if (input.mode === "long") return Math.max(0, finite(input.rentYearly));
  const high = clamp(finite(input.highSeasonMonths), 0, MONTHS_PER_YEAR);
  const nightly =
    (Math.max(0, finite(input.nightlyHigh)) * high +
      Math.max(0, finite(input.nightlyLow)) * (MONTHS_PER_YEAR - high)) /
    MONTHS_PER_YEAR;
  return NIGHTS_PER_YEAR * share(clamp(finite(input.occupancyPct), 0, 100)) * nightly;
}

type YearFlows = Omit<RoiYear, "cumulativeCashFlow" | "totalReturn">;

/** One year of the simulation, in exact (unrounded) money. */
function simulateYear(
  input: RoiInput,
  year: number,
  schedule: AmortisationYear[],
  baseGross: number,
): YearFlows {
  const rentGrowth = (1 + share(input.rentGrowthPct)) ** (year - 1);
  const priceGrowth = 1 + share(input.priceGrowthPct);
  const valueAtStart = input.price * priceGrowth ** (year - 1);
  const grossRent = baseGross * rentGrowth;
  const long = input.mode === "long";
  const income = long ? grossRent * (1 - share(clamp(input.vacancyPct, 0, 100))) : grossRent;
  const management = long ? 0 : grossRent * share(input.managementFeePct);
  const serviceCharge =
    Math.max(0, input.serviceChargePerArea) * Math.max(0, input.size) * rentGrowth;
  const maintenance = valueAtStart * share(input.maintenancePct);
  const operatingCosts = serviceCharge + maintenance + management;
  const loanYear = schedule[year - 1];
  const mortgagePayments = loanYear ? loanYear.principal + loanYear.interest : 0;
  const loanBalance = loanYear ? loanYear.balance : 0;
  const value = valueAtStart * priceGrowth;
  return {
    year,
    grossRent,
    income,
    operatingCosts,
    mortgagePayments,
    netCashFlow: income - operatingCosts - mortgagePayments,
    value,
    loanBalance,
    equity: value - loanBalance,
  };
}

function sanitize(input: RoiInput): RoiInput {
  const price = Math.max(0, Math.round(finite(input.price)));
  return {
    ...input,
    price,
    purchaseCostsPct: Math.max(0, finite(input.purchaseCostsPct)),
    serviceChargePerArea: finite(input.serviceChargePerArea),
    size: finite(input.size),
    maintenancePct: Math.max(0, finite(input.maintenancePct)),
    managementFeePct: clamp(finite(input.managementFeePct), 0, 100),
    vacancyPct: finite(input.vacancyPct),
    rentGrowthPct: Math.max(-99, finite(input.rentGrowthPct)),
    priceGrowthPct: Math.max(-99, finite(input.priceGrowthPct)),
    mortgage: input.mortgage
      ? {
          downPayment: clamp(Math.round(finite(input.mortgage.downPayment)), 0, price),
          ratePct: finite(input.mortgage.ratePct),
          years: Math.max(1, finite(input.mortgage.years)),
        }
      : null,
  };
}

/**
 * The rental return simulator (11 §2): yields, the yearly cash flow, equity and total return
 * over the horizon, the IRR (selling at the value reached, no selling costs) and the
 * break-even year. Assumptions: rents and service charges rise with the rent growth, the
 * value with the price growth, maintenance is a share of the value at the start of each year,
 * mortgage repayments include the principal, and everything is before tax.
 */
export function rentalReturns(raw: RoiInput, horizonYears = 10): RoiResult {
  const input = sanitize(raw);
  const loan = input.mortgage ? input.price - input.mortgage.downPayment : 0;
  const schedule = input.mortgage
    ? amortisation(loan, input.mortgage.ratePct, input.mortgage.years)
    : [];
  const purchaseCosts = Math.round(input.price * share(input.purchaseCostsPct));
  const cashInvested = input.price - loan + purchaseCosts;
  const baseGross = grossRentFirstYear(input);

  const horizon = Math.max(1, Math.round(horizonYears));
  const years: RoiYear[] = [];
  let cumulative = 0;
  let breakEvenYear: number | null = null;
  const last = Math.max(horizon, BREAK_EVEN_HORIZON_YEARS);
  for (let year = 1; year <= last; year++) {
    if (year > horizon && (breakEvenYear !== null || cashInvested <= 0)) break;
    const exact = simulateYear(input, year, schedule, baseGross);
    const netCashFlow = Math.round(exact.netCashFlow);
    cumulative += netCashFlow;
    if (breakEvenYear === null && cashInvested > 0 && cumulative >= cashInvested)
      breakEvenYear = year;
    if (year > horizon) continue;
    const value = Math.round(exact.value);
    const loanBalance = Math.round(exact.loanBalance);
    const equity = value - loanBalance;
    years.push({
      year,
      grossRent: Math.round(exact.grossRent),
      income: Math.round(exact.income),
      operatingCosts: Math.round(exact.operatingCosts),
      mortgagePayments: Math.round(exact.mortgagePayments),
      netCashFlow,
      cumulativeCashFlow: cumulative,
      value,
      loanBalance,
      equity,
      totalReturn: cumulative + equity - cashInvested,
    });
  }

  const first = years[0]!;
  // Year one income after costs (no financing), as for the listing's investment snapshot.
  const operatingIncome = first.income - first.operatingCosts;
  // Sold at the end of the horizon: the last year also brings back the equity.
  const flows = [
    -cashInvested,
    ...years.map((y, i) => y.netCashFlow + (i === years.length - 1 ? y.equity : 0)),
  ];
  const allIn = input.price + purchaseCosts;
  return {
    loan,
    purchaseCosts,
    cashInvested,
    grossRentYear1: first.grossRent,
    grossYieldPct: ratio(first.grossRent, input.price) * 100,
    netYieldPct: ratio(operatingIncome, allIn) * 100,
    netCashFlowYear1: first.netCashFlow,
    cashOnCashPct: cashInvested > 0 ? (first.netCashFlow / cashInvested) * 100 : null,
    years,
    irrPct: irr(flows),
    breakEvenYear,
  };
}

/* Yields for the listing page -------------------------------------------------------- */

export type RoiDefaults = { vacancyPct: number; maintenancePct: number; purchaseCostsPct: number };

/**
 * Gross yield = yearly rent / price. The estimated net yield takes off a vacancy allowance,
 * the yearly service charge and maintenance, and adds purchase costs to the price (the
 * simulator's first year for a long let bought with cash). Percentages with one decimal.
 */
export function yields(
  input: {
    price: number;
    rentYearly: number;
    /** Minor units per area unit a year (any unit, the same as `size`). */
    serviceChargePerArea: number | null;
    size: number | null;
  },
  roi: RoiDefaults,
): { gross: number; net: number } {
  const r = rentalReturns(
    {
      price: input.price,
      purchaseCostsPct: roi.purchaseCostsPct,
      mode: "long",
      rentYearly: input.rentYearly,
      nightlyHigh: 0,
      nightlyLow: 0,
      highSeasonMonths: 0,
      occupancyPct: 0,
      managementFeePct: 0,
      serviceChargePerArea: input.serviceChargePerArea ?? 0,
      size: input.size ?? 0,
      maintenancePct: roi.maintenancePct,
      vacancyPct: roi.vacancyPct,
      mortgage: null,
      rentGrowthPct: 0,
      priceGrowthPct: 0,
    },
    1,
  );
  return { gross: roundTo(r.grossYieldPct, 1), net: roundTo(r.netYieldPct, 1) };
}

/** Rounds to a number of decimals (for display; 4.65 → 4.7). */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Halves away from zero; the nudge counters 2.105 being stored as 2.10499999….
  const rounded = Math.round(Math.abs(value) * f * (1 + Number.EPSILON)) / f;
  return value < 0 ? -rounded : rounded;
}

/* IRR ---------------------------------------------------------------------------- */

function npv(rate: number, flows: number[]): number {
  let sum = 0;
  for (let t = 0; t < flows.length; t++) sum += flows[t]! / (1 + rate) ** t;
  return sum;
}

/**
 * Internal rate of return of yearly cash flows (flows[0] is today), as a percentage: the rate
 * at which their net present value is zero. Null when the flows never change sign (there is
 * no such rate) or no rate between −99.99% and 1,000,000% fits. Newton's method from 10%,
 * then bisection when it does not settle.
 */
export function irr(flows: number[]): number | null {
  if (flows.length < 2 || !flows.every(Number.isFinite)) return null;
  if (!flows.some((f) => f > 0) || !flows.some((f) => f < 0)) return null;
  const scale = Math.max(...flows.map(Math.abs));
  const tolerance = scale * 1e-12;

  let rate = 0.1;
  for (let i = 0; i < 60; i++) {
    const value = npv(rate, flows);
    if (Math.abs(value) <= tolerance) return rate * 100;
    let slope = 0;
    for (let t = 1; t < flows.length; t++) slope -= (t * flows[t]!) / (1 + rate) ** (t + 1);
    if (!Number.isFinite(slope) || slope === 0) break;
    const next = rate - value / slope;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    rate = next;
  }

  let lo = -0.9999;
  let hi = 1;
  let atLo = npv(lo, flows);
  let atHi = npv(hi, flows);
  while (Math.sign(atLo) === Math.sign(atHi) && hi < 1e4) {
    lo = hi;
    atLo = atHi;
    hi *= 4;
    atHi = npv(hi, flows);
  }
  if (Math.sign(atLo) === Math.sign(atHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const atMid = npv(mid, flows);
    if (Math.abs(atMid) <= tolerance || hi - lo < 1e-12) return mid * 100;
    if (Math.sign(atMid) === Math.sign(atLo)) {
      lo = mid;
      atLo = atMid;
    } else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}
