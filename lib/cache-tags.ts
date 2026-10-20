import type { SettingGroup } from "@/db/schema/system";

/**
 * Cache tag names in one place (01 §4: editing a listing only revalidates that listing,
 * its search results and its project page). Tags must stay under 256 characters.
 */
export const tags = {
  settings: (group: SettingGroup) => `settings:${group}`,
  allSettings: "settings",
  media: (id: string) => `media:${id}`,
  agents: "agents",
  agent: (id: string) => `agent:${id}`,
  locations: "locations",
  leadStages: "lead-stages",
  masterData: (kind: string) => `master:${kind}`,
  listing: (id: string) => `listing:${id}`,
  listings: "listings",
  search: "search",
  project: (id: string) => `project:${id}`,
  projects: "projects",
  developer: (id: string) => `developer:${id}`,
  developers: "developers",
  page: (id: string) => `page:${id}`,
  pages: "pages",
  homePage: "page:home",
  menus: "menus",
  posts: "posts",
  post: (id: string) => `post:${id}`,
  areaGuides: "area-guides",
  areaGuide: (id: string) => `area-guide:${id}`,
  faqs: "faqs",
  testimonials: "testimonials",
  redirects: "redirects",
  sitemap: "sitemap",
} as const;
