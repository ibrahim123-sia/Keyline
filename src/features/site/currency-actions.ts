"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { CURRENCY_COOKIE, siteRates } from "./currency";

/** Currency switcher (06 §2): remembers the visitor's display currency for a year. */
export async function setCurrency(input: {
  code: string;
}): Promise<ActionResult<{ code: string }>> {
  const parsed = z
    .object({ code: z.string().regex(/^[A-Z]{3}$/) })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a currency.", code: "VALIDATION" };
  const rates = await siteRates();
  const { code } = parsed.data;
  if (code !== rates.base.code && !rates.others.some((c) => c.code === code))
    return { ok: false, error: "This currency is not offered.", code: "VALIDATION" };
  (await cookies()).set(CURRENCY_COOKIE, code, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true, data: { code } };
}
