/** Interface words of the page sections (content itself comes from the page builder). */
export const sectionsText = {
  search: {
    tabs: { buy: "Buy", rent: "Rent", off_plan: "Off-plan" },
    location: "Area, building or project",
    locationPlaceholder: "Where would you like to live?",
    type: "Type",
    anyType: "Any type",
    budget: "Budget",
    anyBudget: "Any budget",
    upTo: "Up to",
    beds: "Beds",
    anyBeds: "Any",
    studio: "Studio",
    submit: "Search",
  },
  listings: { viewAll: "View all" },
  areas: {
    forSale: (n: number) => `${n} for sale`,
    toRent: (n: number) => `${n} to rent`,
    noHomes: "New homes coming soon",
  },
  projects: { handover: "Handover", from: "from", progress: (n: number) => `${n}% built` },
} as const;
