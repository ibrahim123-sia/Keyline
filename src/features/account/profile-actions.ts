"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { normalizeVisitorPhone } from "@/features/inquiries/schema";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { requireCustomer } from "@/lib/auth/guards";
import { deleteCustomerAccount } from "./privacy";
import { savePreferences, updateProfile } from "./profile";

const channels = z.object({ email: z.boolean(), whatsapp: z.boolean() });

function invalid(error: z.ZodError): ActionResult<never> {
  const { fieldErrors, formErrors } = errorsByPath(error);
  return {
    ok: false,
    error: formErrors[0] ?? "Please check the highlighted fields.",
    code: "VALIDATION",
    fieldErrors,
  };
}

/** Profile (12 §2): name, phone and how they like to be contacted. */
export async function saveMyProfile(input: {
  name: string;
  phone: string;
  preferredContact: "whatsapp" | "call" | "email" | null;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const user = await requireCustomer();
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
        phone: z.string().trim().max(30, "That number is too long"),
        preferredContact: z.enum(["whatsapp", "call", "email"]).nullable(),
      })
      .safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const db = await getDb();
    const market = await loadSettings("market", db);
    const phone = parsed.data.phone
      ? normalizeVisitorPhone(parsed.data.phone, market.phoneCountryCode)
      : null;
    if (parsed.data.phone && !phone)
      throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
        phone: ["Enter the number with the country code, for example +44 20 7946 0000"],
      });
    await updateProfile(db, user.id, { ...parsed.data, phone });
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function saveMyNotifications(input: {
  newMatch: { email: boolean; whatsapp: boolean };
  priceDrop: { email: boolean; whatsapp: boolean };
  statusChange: { email: boolean; whatsapp: boolean };
  whatsappOptIn: boolean;
  newsletter: boolean;
  marketingConsent: boolean;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const user = await requireCustomer();
    const parsed = z
      .object({
        newMatch: channels,
        priceDrop: channels,
        statusChange: channels,
        whatsappOptIn: z.boolean(),
        newsletter: z.boolean(),
        marketingConsent: z.boolean(),
      })
      .safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    await savePreferences(await getDb(), user.id, parsed.data);
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return toActionError(err);
  }
}

/** Delete my account (12 §2): the customer types DELETE to confirm; then they are signed out. */
export async function deleteMyAccount(input: {
  confirm: string;
}): Promise<ActionResult<{ deleted: true }>> {
  try {
    const user = await requireCustomer();
    if (input.confirm?.trim().toUpperCase() !== "DELETE")
      return {
        ok: false,
        error: "Type DELETE to confirm.",
        code: "VALIDATION",
        fieldErrors: { confirm: ["Type DELETE to confirm."] },
      };
    const db = await getDb();
    try {
      const { getAuth } = await import("@/lib/auth/server");
      await (await getAuth()).api.signOut({ headers: await headers() });
    } catch {
      // No session cookie to clear (tests); the sessions go with the account anyway.
    }
    await deleteCustomerAccount(db, user.id);
    return { ok: true, data: { deleted: true } };
  } catch (err) {
    return toActionError(err);
  }
}
