import type { Metadata, Viewport } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSettings } from "@/features/settings/queries";
import { getPublicMedia } from "@/features/media/queries";
import { siteTitleTemplate } from "@/features/seo/titles";
import { fontVariableClasses } from "@/lib/fonts";
import { brandingCss } from "@/lib/tokens";
import "./globals.css";

// The settings and media reads are cached functions, so this stays part of the static shell.
export async function generateMetadata(): Promise<Metadata> {
  const [general, seo] = await Promise.all([getSettings("general"), getSettings("seo")]);
  const favicon = await getPublicMedia(general.faviconId);
  const appIcon = await getPublicMedia(general.appIconId);
  const agency = general.agencyName;
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: {
      default: agency,
      // Settings pattern like "%page% | %agency%"; Next fills %s with the page title.
      template: siteTitleTemplate(seo.titlePattern, agency),
    },
    description: seo.defaultMetaDescription || general.shortDescription || undefined,
    applicationName: agency,
    icons: favicon
      ? { icon: favicon.url, apple: appIcon?.url ?? favicon.url }
      : { icon: "/favicon.ico" },
    verification: {
      google: seo.googleVerification || undefined,
      other: seo.bingVerification ? { "msvalidate.01": seo.bingVerification } : undefined,
    },
    robots:
      seo.allowIndexing && process.env.KEYLINE_ENV !== "staging"
        ? undefined
        : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F3EE",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [general, branding] = await Promise.all([getSettings("general"), getSettings("branding")]);
  return (
    <html
      lang={general.defaultLanguage}
      dir={general.rtl ? "rtl" : "ltr"}
      className={fontVariableClasses}
      suppressHydrationWarning
    >
      <head>
        {/* Design tokens from Settings -> Branding (validated values only, see lib/tokens.ts). */}
        <style id="keyline-tokens" dangerouslySetInnerHTML={{ __html: brandingCss(branding) }} />
      </head>
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
