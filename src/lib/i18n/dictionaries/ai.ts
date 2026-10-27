/** Wording of the AI service layer (10): fallbacks, budget emails, labels. */
export const ai = {
  unavailable: {
    off: "AI features are turned off.",
    feature_off: "This AI feature is turned off in Settings -> AI.",
    monthly_limit: "This month's AI spend limit has been reached.",
    daily_limit: "Today's AI budget has been reached.",
    no_key: "The AI provider key is missing in Settings -> Integrations.",
    rate_limited: "Too many messages in a short time. Please wait a moment.",
    provider_error: "The AI provider did not answer.",
  },
  /** What a visitor sees when the assistant cannot answer: the normal chat with the team. */
  customerFallback: "Thanks for your message. Someone from our team will reply here shortly.",
  notSure: "I don't know that yet. I can ask our team to help you.",
  handover: "Good question for our team. I've asked {agent} to reply to you.",
  personAsked: "I've asked {agent} to reply to you here. You can keep writing in the meantime.",
  stepsExhausted: "I need a moment longer on that one. I've asked our team to help you.",
  budgetEmail: {
    alertSubject: "AI spend has reached {pct}% of this month's limit",
    alertBody:
      "Propel's estimated AI spend this month is {spent} of the {limit} limit set in Settings -> AI.\n\nWhen the limit is reached, AI features pause until next month and visitors' chats go to the team as usual.",
    limitSubject: "AI features paused: this month's spend limit is reached",
    limitBody:
      "Propel's estimated AI spend this month has reached the {limit} limit set in Settings -> AI.\n\nAI features are paused until next month (or until the limit is raised). Website chats go to the team, and leads are scored by the rules.",
    button: "Open AI settings",
  },
  features: {
    customer_chat: "Website assistant",
    whatsapp: "WhatsApp assistant",
    admin_chat: "Admin assistant",
    description: "Listing descriptions",
    seo: "SEO suggestions",
    blog: "Blog drafts",
    valuation: "Valuations",
    scoring: "Lead scoring",
    summary: "Conversation summaries",
    alt_text: "Alt text",
    listing_from_text: "Listings from text",
    topics: "Chat topics",
    embeddings: "Search index",
  },
} as const;
