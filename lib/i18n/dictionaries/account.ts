/** Customer area strings (12-customer-area.md). */
export const account = {
  nav: {
    overview: "Overview",
    saved: "Saved homes",
    searches: "Saved searches",
    tours: "Tours",
    inquiries: "Inquiries",
    chats: "Chats",
    compare: "Compare",
    profile: "Profile",
    notifications: "Notifications",
    privacy: "Privacy",
  },
  overview: {
    greeting: "Hello, {name}",
    intro: "Your saved homes, searches and tours in one place.",
  },
  empty: {
    nothingYet: "Nothing here yet.",
  },
} as const;

export type AccountDictionary = typeof account;
