import { z } from "zod";

/**
 * The calculators' forms (11 §1 pre-approval, §2 "Email me this report"): one schema for the
 * browser and the server (01 §2 "Same Zod schema on client and server"). The calculation the
 * visitor was looking at comes along, checked against the same bounds as the calculator.
 */

export const employmentTypes = [
  "employed",
  "self_employed",
  "business_owner",
  "retired",
  "other",
] as const;
export type EmploymentType = (typeof employmentTypes)[number];

/** Minor units: up to 10^12 major units with three decimals. */
const minor = z.number().int().min(0).max(1e15);
const pct = (min: number, max: number) => z.number().min(min).max(max);

const contact = {
  name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
  email: z.email("Enter a valid email address").max(160, "Enter a valid email address"),
  consent: z.literal(true, { error: "Please tick the box so we can contact you." }),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).default(""),
  captchaToken: z.string().max(4000).nullable().default(null),
};

/** The listing reference the calculator was opened from. */
const listingRef = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/)
  .nullable();

export const mortgageCalculationSchema = z
  .object({
    price: minor.min(1, "Enter the property price"),
    downPayment: minor,
    years: z.number().int().min(1).max(40),
    ratePct: pct(0, 30),
    registrationFeePct: pct(0, 20),
    agencyFeePct: pct(0, 20),
    arrangementFeePct: pct(0, 20),
  })
  .strict()
  .refine((c) => c.downPayment <= c.price, { path: ["downPayment"], message: "Too high" });

export const preApprovalSchema = z
  .object({
    ...contact,
    phone: z.string().trim().min(6, "Enter your phone number").max(30, "That number is too long"),
    /** Index of the band in Settings -> Market -> income bands. */
    incomeBand: z.string().regex(/^\d$/, "Choose your monthly income"),
    employment: z.enum(employmentTypes, { error: "Choose your employment" }),
    downPaymentReady: z.enum(["yes", "no"], { error: "Choose yes or not yet" }),
    calculation: mortgageCalculationSchema,
    ref: listingRef.default(null),
  })
  .strict();
export type PreApprovalInput = z.input<typeof preApprovalSchema>;

export const roiCalculationSchema = z
  .object({
    price: minor.min(1, "Enter the purchase price"),
    purchaseCostsPct: pct(0, 20),
    mode: z.enum(["long", "short"]),
    rentYearly: minor,
    nightlyHigh: minor,
    nightlyLow: minor,
    highSeasonMonths: z.number().int().min(0).max(12),
    occupancyPct: pct(0, 100),
    managementFeePct: pct(0, 50),
    serviceChargePerArea: minor,
    size: z.number().min(0).max(10_000_000),
    maintenancePct: pct(0, 20),
    vacancyPct: pct(0, 100),
    mortgageOn: z.boolean(),
    downPct: pct(0, 100),
    ratePct: pct(0, 30),
    years: z.number().int().min(1).max(40),
    rentGrowthPct: pct(-20, 30),
    priceGrowthPct: pct(-20, 30),
    ref: listingRef,
  })
  .strict();
export type RoiCalculation = z.output<typeof roiCalculationSchema>;

export const roiReportSchema = z
  .object({
    ...contact,
    name: z.string().trim().max(80, "Use at most 80 characters").default(""),
    phone: z.string().trim().max(30, "That number is too long").default(""),
    calculation: roiCalculationSchema,
  })
  .strict();
export type RoiReportInput = z.input<typeof roiReportSchema>;
