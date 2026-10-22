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
  save: {
    saveLabel: "Save",
    unsaveLabel: "Remove from saved",
    saveShort: "Save",
    savedShort: "Saved",
    saved: "Saved to your account",
    removed: "Removed from your saved homes",
    promptTitle: "Save this home to your account",
    promptText: "Sign in or create a free account. You come back here and it is saved.",
    signIn: "Sign in",
    signUp: "Create an account",
  },
  compare: {
    add: "Compare",
    added: "Comparing",
    addLabel: "Add to compare",
    removeLabel: "Remove from compare",
    tray: "Compare ({count})",
  },
  searches: {
    save: "Save search",
    saveIntro: "We tell you about new homes that match, as often as you like.",
    name: "Name",
    frequency: "Tell me about new homes",
    frequencies: {
      instant: "As soon as they are listed",
      daily: "Once a day",
      weekly: "Once a week",
      off: "Never (just keep the search)",
    },
    saveButton: "Save search",
    saved: "Search saved. We'll let you know about new homes.",
    promptTitle: "Save this search to your account",
  },
} as const;

export type AccountDictionary = typeof account;
