/**
 * Interface words around page builder content (08 §1): templates, the preview banner and
 * the section types. The content itself (headings, text, buttons) comes from the pages.
 */
export const cms = {
  legal: {
    lastUpdated: "Last updated {date}",
    onThisPage: "On this page",
  },
  preview: {
    banner: "Preview: this version of the page is not published.",
    expires: "The link works until {date}.",
    expiredTitle: "This preview link has expired",
    expiredText: "Preview links work for 7 days. Ask for a new link.",
    status: { draft: "Draft", published: "Published", scheduled: "Scheduled" },
  },
  landing: {
    call: "Call",
    whatsapp: "WhatsApp",
  },
  sections: {
    nothingYet: "Nothing to show yet",
    viewAll: "View all",
  },
  testimonials: {
    rating: "{n} out of 5",
    previous: "Previous testimonial",
    next: "Next testimonial",
  },
  team: {
    viewProfile: "View profile",
    languages: "Speaks {languages}",
  },
  posts: {
    minutes: "{n} min read",
  },
  video: {
    play: "Play video",
  },
  gallery: {
    open: "Open image {n} of {count}",
    close: "Close",
    previous: "Previous image",
    next: "Next image",
  },
  map: {
    label: "Map",
    office: "Our office",
  },
  contact: {
    phone: "Phone",
    whatsapp: "WhatsApp",
    email: "Email",
    address: "Office",
    hours: "Opening hours",
    directions: "Get directions",
  },
} as const;
