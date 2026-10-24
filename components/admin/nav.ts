import {
  BarChart3Icon,
  BuildingIcon,
  CircleHelpIcon,
  CalendarDaysIcon,
  ContactIcon,
  FileTextIcon,
  GaugeIcon,
  HomeIcon,
  ImageIcon,
  InboxIcon,
  LayoutDashboardIcon,
  MapIcon,
  MapPinIcon,
  MegaphoneIcon,
  MenuSquareIcon,
  MessageSquareQuoteIcon,
  NewspaperIcon,
  PercentIcon,
  SearchIcon,
  SettingsIcon,
  ShapesIcon,
  SparklesIcon,
  TagIcon,
  UserRoundIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { AdminDictionary } from "@/lib/i18n/dictionaries/admin";

export type AdminNavItem = {
  key: keyof AdminDictionary["nav"];
  href: string;
  icon: LucideIcon;
  /** Modules appear once they are built (see docs/PROGRESS.md phases). */
  enabled: boolean;
};

export type AdminNavGroup = { label?: keyof AdminDictionary["nav"]; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  {
    items: [
      { key: "dashboard", href: "/admin", icon: LayoutDashboardIcon, enabled: true },
      { key: "inbox", href: "/admin/inbox", icon: InboxIcon, enabled: true },
      { key: "leads", href: "/admin/leads", icon: UsersIcon, enabled: true },
      { key: "contacts", href: "/admin/contacts", icon: ContactIcon, enabled: true },
      { key: "viewings", href: "/admin/viewings", icon: CalendarDaysIcon, enabled: true },
      { key: "campaigns", href: "/admin/campaigns", icon: MegaphoneIcon, enabled: true },
    ],
  },
  {
    items: [
      { key: "properties", href: "/admin/properties", icon: HomeIcon, enabled: true },
      { key: "projects", href: "/admin/projects", icon: BuildingIcon, enabled: true },
      { key: "media", href: "/admin/media", icon: ImageIcon, enabled: true },
    ],
  },
  {
    label: "website",
    items: [
      { key: "pages", href: "/admin/website/pages", icon: FileTextIcon, enabled: true },
      { key: "blog", href: "/admin/website/blog", icon: NewspaperIcon, enabled: true },
      { key: "areaGuides", href: "/admin/website/area-guides", icon: MapIcon, enabled: true },
      {
        key: "testimonials",
        href: "/admin/website/testimonials",
        icon: MessageSquareQuoteIcon,
        enabled: true,
      },
      { key: "faqs", href: "/admin/website/faqs", icon: CircleHelpIcon, enabled: true },
      { key: "menus", href: "/admin/website/menus", icon: MenuSquareIcon, enabled: true },
      { key: "seo", href: "/admin/website/seo", icon: SearchIcon, enabled: true },
    ],
  },
  {
    items: [{ key: "reports", href: "/admin/reports", icon: BarChart3Icon, enabled: true }],
  },
  {
    label: "setup",
    items: [
      { key: "locations", href: "/admin/setup/locations", icon: MapPinIcon, enabled: true },
      {
        key: "propertyTypes",
        href: "/admin/setup/property-types",
        icon: ShapesIcon,
        enabled: true,
      },
      { key: "facilities", href: "/admin/setup/facilities", icon: SparklesIcon, enabled: true },
      { key: "badges", href: "/admin/setup/badges", icon: TagIcon, enabled: true },
      { key: "poiTypes", href: "/admin/setup/poi-types", icon: WrenchIcon, enabled: true },
      { key: "pois", href: "/admin/setup/pois", icon: MapPinIcon, enabled: true },
      { key: "developers", href: "/admin/setup/developers", icon: BuildingIcon, enabled: true },
      {
        key: "paymentPlans",
        href: "/admin/setup/payment-plans",
        icon: PercentIcon,
        enabled: true,
      },
      { key: "agents", href: "/admin/setup/agents", icon: UserRoundIcon, enabled: true },
    ],
  },
  {
    items: [
      { key: "settings", href: "/admin/settings", icon: SettingsIcon, enabled: true },
      { key: "system", href: "/admin/settings/system", icon: GaugeIcon, enabled: true },
    ],
  },
];

export function enabledNav(): AdminNavGroup[] {
  return adminNav
    .map((g) => ({ ...g, items: g.items.filter((i) => i.enabled) }))
    .filter((g) => g.items.length > 0);
}
