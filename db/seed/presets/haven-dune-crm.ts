import type { SeedPreset } from "../types";

/** Demo customers and inbox of the Haven & Dune preset (16 §1); people are fictional. */
export const havenDuneCustomers: SeedPreset["customers"] = [
  {
    email: "mina@demo.propel",
    name: "Mina Park",
    phone: "+971500000201",
    search: {
      name: "Two-bed homes in Dubai Marina",
      query: "loc=dubai-marina&beds=2",
      frequency: "daily",
    },
  },
  {
    email: "omar.customer@demo.propel",
    name: "Omar Haddad",
    phone: "+971500000202",
    search: { name: "Villas to rent", query: "purpose=rent&type=villas", frequency: "weekly" },
  },
  {
    email: "lucy@demo.propel",
    name: "Lucy Grant",
    phone: "+447700900321",
    search: {
      name: "Off-plan with a payment plan",
      query: "completion=off_plan&plan=any",
      frequency: "instant",
    },
  },
];

export const havenDuneInbox: SeedPreset["inbox"] = {
  quickReplies: [
    {
      title: "Viewing times",
      body: "We show homes every day from 9 am to 7 pm. Which day and time suit you?",
    },
    {
      title: "Documents to rent",
      body: "To rent you will need a passport copy, visa and Emirates ID, and the first cheque or transfer.",
    },
    {
      title: "Service charges",
      body: "Service charges are set by the building each year. I will send you this year's figure with the listing.",
    },
    {
      title: "Payment plans",
      body: "Most of our off-plan projects take 10 to 20% on booking and the rest in stages. Shall I send the plan?",
    },
  ],
  conversations: [
    {
      channel: "whatsapp",
      who: { name: "Amira Haddad", phone: "+971500000301" },
      status: "human",
      lines: [
        {
          dir: "in",
          sender: "customer",
          body: "Hi, is the two bed at Marina Gate still available?",
          ago: 130,
        },
        {
          dir: "out",
          sender: "admin",
          body: "Hello Amira, yes it is. Would you like to see it this week?",
          ago: 118,
          status: "read",
        },
        { dir: "in", sender: "customer", body: "Saturday morning works for me.", ago: 32 },
      ],
    },
    {
      channel: "web_chat",
      who: { name: "Priya Nair", email: "priya.nair@example.com" },
      status: "needs_human",
      lines: [
        {
          dir: "in",
          sender: "customer",
          body: "Do you have family villas with a garden under 5M?",
          ago: 12,
        },
      ],
    },
    {
      channel: "email",
      who: { name: "James Carter", email: "james.carter@example.com" },
      status: "human",
      subject: "Service charges for the Linden Residences",
      lines: [
        {
          dir: "in",
          sender: "customer",
          body: "Could you tell me the service charge per square metre?",
          ago: 60 * 26,
        },
        {
          dir: "out",
          sender: "admin",
          body: "Hello James, this year's charge is in the attached note; I have also sent the payment plan.",
          ago: 60 * 25,
        },
      ],
    },
    {
      channel: "whatsapp",
      who: { name: "Omar Saeed", phone: "+971500000302" },
      status: "ai",
      lines: [
        {
          dir: "in",
          sender: "customer",
          body: "Would the owner take 2.3M for the townhouse?",
          ago: 8,
        },
        {
          dir: "out",
          sender: "ai",
          body: "Thanks Omar. I have asked the agent about the price; they will reply shortly.",
          ago: 7,
          tools: [{ tool: "search_listings", summary: "Found the townhouse he asked about" }],
        },
      ],
      approval: {
        draftReply:
          "The owner has accepted offers near the asking price before; 2.3M may be considered with a quick transfer.",
        reason: "price negotiation",
        ago: 6,
      },
    },
  ],
};
