/**
 * Email and WhatsApp message templates (13 §1, §3) with their built-in wording. An agency can
 * change any of them (message_templates rows override these by channel and key). Variables
 * are written {{name}}; unknown ones render empty. Client-safe (the editor shows them).
 */
export type TemplateChannel = "email" | "whatsapp";

export type TemplateDefault = {
  /** Who receives it. */
  audience: "customer" | "internal";
  /** What it is for, in the templates editor. */
  label: string;
  variables: string[];
  email?: { subject: string; body: string; button?: string };
  /** Sent as a session message inside the 24-hour window; outside it, an approved template. */
  whatsapp?: { body: string };
};

export const templateDefaults = {
  "lead.auto_reply": {
    audience: "customer",
    label: "Auto-reply to a new lead",
    variables: ["name", "agent", "agency", "reference", "url"],
    email: {
      subject: "Thanks, {{name}}. We have your message",
      body: "Hello {{name}},\n\nThank you for getting in touch with {{agency}}. {{agent}} will reach out shortly.\n\nWould you like to see the home in person? Reply to this email with a day and time that suit you.",
      button: "See the home again",
    },
    whatsapp: {
      body: "Thanks, {{name}}. {{agent}} from {{agency}} will reach out shortly. Want to book a viewing?",
    },
  },
  "lead.new": {
    audience: "internal",
    label: "New lead (to the agent and the lead inbox)",
    variables: [
      "name",
      "phone",
      "email",
      "source",
      "reference",
      "interest",
      "details",
      "message",
      "agent",
      "url",
    ],
    email: {
      subject: "New lead: {{name}} · {{reference}} · {{source}}",
      body: "{{name}} · {{phone}} · {{email}}\nInterested in: {{interest}}\nAssigned to: {{agent}}\n{{details}}\n\n{{message}}",
      button: "Open the lead",
    },
    whatsapp: { body: "New lead: {{name}} ({{source}}) about {{interest}}. {{url}}" },
  },
  "lead.new_message": {
    audience: "internal",
    label: "A lead got in touch again",
    variables: [
      "name",
      "phone",
      "email",
      "source",
      "reference",
      "interest",
      "details",
      "message",
      "url",
    ],
    email: {
      subject: "{{name}} got in touch again · {{reference}} · {{source}}",
      body: "{{name}} · {{phone}} · {{email}}\nAbout: {{interest}}\n{{details}}\n\n{{message}}",
      button: "Open the lead",
    },
  },
  "lead.not_answered": {
    audience: "internal",
    label: "Lead not answered in time",
    variables: ["name", "minutes", "agent", "source", "url"],
    email: {
      subject: "Not answered for {{minutes}} minutes: {{name}}",
      body: "{{name}} ({{source}}) has been waiting {{minutes}} minutes for a reply.\nAssigned to: {{agent}}",
      button: "Reply now",
    },
    whatsapp: { body: "{{name}} has been waiting {{minutes}} minutes for a reply. {{url}}" },
  },
  "viewing.confirmed": {
    audience: "customer",
    label: "Viewing booked (to the visitor)",
    variables: ["name", "what", "when", "agencyTime", "how", "agent", "agency", "manageUrl"],
    email: {
      subject: "Your viewing is booked: {{when}}",
      body: "Hello {{name}},\n\nYou are booked to see {{what}} on {{when}}{{agencyTime}}.\n{{how}}\n{{agent}} from {{agency}} will be with you.\n\nNeed another time? Change or cancel here: {{manageUrl}}",
      button: "Add to my calendar",
    },
    whatsapp: {
      body: "Your viewing of {{what}} is booked for {{when}}. {{agent}} will be with you. Change or cancel: {{manageUrl}}",
    },
  },
  "viewing.booked": {
    audience: "internal",
    label: "New viewing (to the agent and the lead inbox)",
    variables: ["name", "phone", "email", "what", "when", "how", "notes", "url"],
    email: {
      subject: "New viewing: {{name}} · {{what}} · {{when}}",
      body: "{{name}} · {{phone}} · {{email}}\n{{what}}\n{{when}}\n{{how}}\n\n{{notes}}",
      button: "Open the lead",
    },
    whatsapp: { body: "New viewing: {{name}}, {{what}}, {{when}}. {{url}}" },
  },
  "viewing.rescheduled": {
    audience: "customer",
    label: "Viewing moved (to the visitor)",
    variables: ["name", "what", "when", "agencyTime", "manageUrl"],
    email: {
      subject: "Your viewing has moved to {{when}}",
      body: "Hello {{name}},\n\nYour viewing of {{what}} is now on {{when}}{{agencyTime}}.\n\nChange or cancel here: {{manageUrl}}",
      button: "Add to my calendar",
    },
    whatsapp: { body: "Your viewing of {{what}} has moved to {{when}}. {{manageUrl}}" },
  },
  "viewing.cancelled": {
    audience: "customer",
    label: "Viewing cancelled (to the visitor)",
    variables: ["name", "what", "when", "bookUrl"],
    email: {
      subject: "Your viewing on {{when}} is cancelled",
      body: "Hello {{name}},\n\nYour viewing of {{what}} on {{when}} is cancelled. You can book another time whenever it suits you.",
      button: "Book another time",
    },
    whatsapp: { body: "Your viewing of {{what}} on {{when}} is cancelled. {{bookUrl}}" },
  },
  "viewing.changed": {
    audience: "internal",
    label: "Viewing moved or cancelled (to the agent and the lead inbox)",
    variables: ["name", "what", "when", "change", "url"],
    email: {
      subject: "Viewing {{change}}: {{name}} · {{what}}",
      body: "{{name}}'s viewing of {{what}} was {{change}}.\n{{when}}",
      button: "Open the lead",
    },
    whatsapp: { body: "Viewing {{change}}: {{name}}, {{what}}, {{when}}. {{url}}" },
  },
  "viewing.reminder": {
    audience: "customer",
    label: "Viewing reminder (to the visitor)",
    variables: ["name", "what", "when", "agencyTime", "how", "agent", "manageUrl"],
    email: {
      subject: "Reminder: your viewing {{when}}",
      body: "Hello {{name}},\n\nA reminder that you are seeing {{what}} on {{when}}{{agencyTime}}.\n{{how}}\n{{agent}} will be with you.\n\nCan't make it? Change or cancel here: {{manageUrl}}",
    },
    whatsapp: { body: "Reminder: your viewing of {{what}} is on {{when}}. {{manageUrl}}" },
  },
  "viewing.feedback": {
    audience: "customer",
    label: "How was the viewing? (to the visitor)",
    variables: ["name", "what", "feedbackUrl"],
    email: {
      subject: "How was your viewing of {{what}}?",
      body: "Hello {{name}},\n\nThank you for coming to see {{what}}. Two minutes to tell us what you thought helps us find you the right home.",
      button: "Rate the viewing",
    },
    whatsapp: { body: "Thanks for viewing {{what}}. How was it? {{feedbackUrl}}" },
  },
} satisfies Record<string, TemplateDefault>;

export type TemplateKey = keyof typeof templateDefaults;

export const isTemplateKey = (key: string): key is TemplateKey => key in templateDefaults;

export type TemplateVars = Record<string, string | number | null | undefined>;

/** Fills {{variables}}; missing values become empty and leftover spacing is tidied. */
export function fillTemplate(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name: string) => {
      const value = vars[name];
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/ · (?: · )+/g, " · ")
    .replace(/(?: · )+(?=\n|$)/g, "")
    .replace(/(^|\n)(?: · )+/g, "$1")
    .replace(/: · /g, ": ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
