import type { Db, DbOrTx } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { mediaUrl } from "@/features/media/queries";
import { loadSettings } from "@/features/settings/queries";

/** Brand data every email template needs (13 §1: branded with tokens and logo). */
export type EmailBrand = {
  agencyName: string;
  logoUrl: string | null;
  appUrl: string;
  colors: {
    bg: string;
    surface: string;
    ink: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
    onAccent: string;
  };
  address: string;
  phone: string;
  licenceNumber: string;
};

export async function loadEmailBrand(db?: DbOrTx | Db): Promise<EmailBrand> {
  const [general, branding, contact] = await Promise.all([
    loadSettings("general", db),
    loadSettings("branding", db),
    loadSettings("contact", db),
  ]);
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let logoUrl: string | null = null;
  if (general.logoLightId && db) {
    const [row] = await db
      .select({ r2Key: media.r2Key })
      .from(media)
      .where(and(eq(media.id, general.logoLightId), eq(media.agencyId, currentAgencyId())))
      .limit(1);
    if (row) logoUrl = `${appUrl}${mediaUrl(row.r2Key)}`;
  }
  const c = branding.colors;
  return {
    agencyName: general.agencyName,
    logoUrl,
    appUrl,
    colors: {
      bg: c.bg,
      surface: c.surface,
      ink: c.ink,
      text: c.text,
      textMuted: c.textMuted,
      border: c.border,
      accent: c.accent,
      onAccent: "#FFFFFF",
    },
    address: contact.address,
    phone: contact.phone,
    licenceNumber: general.licenceNumber,
  };
}
