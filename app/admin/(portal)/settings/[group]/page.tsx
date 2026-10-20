import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { AiSettingsForm } from "@/components/admin/settings/groups/ai-form";
import { ContactSettingsForm } from "@/components/admin/settings/groups/contact-form";
import { GeneralSettingsForm } from "@/components/admin/settings/groups/general-form";
import { LegalSettingsForm } from "@/components/admin/settings/groups/legal-form";
import { MarketSettingsForm } from "@/components/admin/settings/groups/market-form";
import { NotificationsSettingsForm } from "@/components/admin/settings/groups/notifications-form";
import { SecuritySettingsForm } from "@/components/admin/settings/groups/security-form";
import { SeoSettingsForm } from "@/components/admin/settings/groups/seo-form";
import { ViewingsSettingsForm } from "@/components/admin/settings/groups/viewings-form";
import { resolveMapStyle } from "@/components/maps/map-style";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { env } from "@/lib/env";

export const instant = false;

const titles = {
  general: ["General", "Agency details, logos, region and maintenance mode."],
  market: ["Market", "Currency, units, rentals and calculator defaults for your market."],
  contact: ["Contact", "How visitors reach you, and where new lead alerts go."],
  viewings: ["Viewings", "When viewings can be booked, video tools and reminders."],
  seo: ["SEO", "Title patterns, defaults and what search engines see."],
  ai: ["AI", "How the website and admin assistants behave."],
  notifications: ["Notifications", "Which events send email or WhatsApp alerts."],
  legal: ["Legal and privacy", "Policy pages, the cookie banner and data retention."],
  security: ["Security", "Two-step verification, sessions and sign-in options."],
} as const;

type Tab = keyof typeof titles;
const isTab = (g: string): g is Tab => g in titles;

export async function generateMetadata(props: PageProps<"/admin/settings/[group]">) {
  const { group } = await props.params;
  return { title: isTab(group) ? `${titles[group][0]} settings` : "Settings" };
}

export default async function SettingsGroupPage(props: PageProps<"/admin/settings/[group]">) {
  const { group } = await props.params;
  if (!isTab(group)) notFound();
  const { user } = await requireAdminPage();
  const readOnly = user.readOnly;
  const db = await getDb();
  const [title, description] = titles[group];

  const form = await (async () => {
    switch (group) {
      case "general": {
        const value = await loadSettings("general", db);
        return (
          <GeneralSettingsForm
            initial={value}
            readOnly={readOnly}
            timeZones={Intl.supportedValuesOf("timeZone")}
          />
        );
      }
      case "market": {
        const [value, integrations] = await Promise.all([
          loadSettings("market", db),
          loadSettings("integrations", db),
        ]);
        return (
          <MarketSettingsForm
            initial={value}
            readOnly={readOnly}
            mapStyleUrl={resolveMapStyle(integrations.googleMaps).styleUrl}
          />
        );
      }
      case "contact": {
        const [value, integrations, market] = await Promise.all([
          loadSettings("contact", db),
          loadSettings("integrations", db),
          loadSettings("market", db),
        ]);
        return (
          <ContactSettingsForm
            initial={value}
            readOnly={readOnly}
            mapStyleUrl={resolveMapStyle(integrations.googleMaps).styleUrl}
            mapCenter={market.mapCenter}
          />
        );
      }
      case "viewings": {
        const [value, general] = await Promise.all([
          loadSettings("viewings", db),
          loadSettings("general", db),
        ]);
        return (
          <ViewingsSettingsForm
            initial={value}
            readOnly={readOnly}
            firstDayOfWeek={general.firstDayOfWeek}
          />
        );
      }
      case "seo":
        return <SeoSettingsForm initial={await loadSettings("seo", db)} readOnly={readOnly} />;
      case "ai":
        return <AiSettingsForm initial={await loadSettings("ai", db)} readOnly={readOnly} />;
      case "notifications":
        return (
          <NotificationsSettingsForm
            initial={await loadSettings("notifications", db)}
            readOnly={readOnly}
          />
        );
      case "legal":
        // Pages arrive with the CMS (Website -> Pages); until then there is nothing to link.
        return (
          <LegalSettingsForm
            initial={await loadSettings("legal", db)}
            readOnly={readOnly}
            pages={[]}
          />
        );
      case "security":
        return (
          <SecuritySettingsForm
            initial={await loadSettings("security", db)}
            readOnly={readOnly}
            googleConfigured={Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET)}
          />
        );
    }
  })();

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumb={[{ label: "Settings" }, { label: title }]}
      />
      {/* A fresh form per tab, so unsaved edits never carry over to another group. */}
      <div key={group}>{form}</div>
    </>
  );
}
