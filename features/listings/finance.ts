/**
 * Listing money maths moved to the tools module (11 intro: all tool maths lives in one tested
 * module). Kept as a re-export so existing imports keep working.
 */
export { monthlyPayment, yields, type RoiDefaults } from "@/features/tools/math";
