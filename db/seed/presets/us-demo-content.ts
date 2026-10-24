import type { SeedContent } from "../content";
import { doc } from "../doc";
import type { SeedPagesCopy } from "../pages";
import { legalText } from "./haven-dune-pages";

/**
 * Website content of the US-style preset (16 §2: "home page and 2 posts"): general guidance
 * written to be useful without inventing facts; figures are marked as samples.
 */
export const usDemoContent: SeedContent = {
  categories: [
    { key: "buying", name: "Buying", description: "Offers, inspections and closing costs." },
    { key: "renting", name: "Renting", description: "Applications, leases and moving in." },
  ],
  posts: [
    {
      title: "What closing costs cover",
      excerpt: "The fees on top of the price when you buy a home, and how to plan for them.",
      category: "buying",
      tags: ["Closing costs", "Fees"],
      author: "maria-delgado",
      daysAgo: 5,
      cover: "living",
      relatedArea: "zilker",
      body: [
        {
          p: "Closing costs are the fees paid when the sale completes, on top of the price and the down payment. Your lender must give you an estimate early, so nothing comes as a surprise.",
        },
        { h: "What is usually included" },
        {
          list: [
            "Lender fees for setting up the loan",
            "The appraisal and the home inspection",
            "Title insurance and the title company's fees",
            "Prepaid property taxes and homeowners insurance",
          ],
        },
        {
          table: [
            ["Example price", "Example closing costs (2-5%)"],
            ["$450,000", "$9,000 to $22,500"],
            ["$750,000", "$15,000 to $37,500"],
          ],
        },
        { p: "The table is an example of the sum, not a quote for any real home." },
        { listing: "zilker" },
        { cta: { label: "Ask an agent", href: "/contact" } },
      ],
    },
    {
      title: "Renting in Austin: the application, step by step",
      excerpt: "What landlords ask for, how long approval takes and what to check in the lease.",
      category: "renting",
      tags: ["Renting", "Applications"],
      author: "sam-whitaker",
      daysAgo: 12,
      cover: "bedroom",
      relatedArea: "downtown",
      body: [
        {
          p: "Most rentals ask for an application, an application fee and proof that the rent is about a third of your income or less.",
        },
        { h: "Before you sign" },
        {
          list: [
            "Check what the rent includes: water, trash and parking are often extra",
            "Ask how repairs are reported and how fast they are fixed",
            "Read the rules for pets and for ending the lease early",
          ],
        },
        {
          quote:
            "Walk through the home with the landlord on move-in day and photograph every room.",
        },
        { listing: "downtown" },
      ],
    },
  ],
  guides: [],
  faqs: [
    {
      group: "buying",
      q: "How much do I need for a down payment?",
      a: "It depends on the loan: some programs allow 3 to 5%, and 20% avoids mortgage insurance on a conventional loan. A lender can tell you what you qualify for.",
    },
    {
      group: "buying",
      q: "Should I get a home inspection?",
      a: "Yes. An inspection during the option period lets you ask for repairs or walk away if something serious turns up.",
    },
    {
      group: "renting",
      q: "How long does a rental application take?",
      a: "Usually one to three business days once the landlord has your documents and the background check is back.",
    },
  ],
  testimonials: [
    {
      name: "Jessica P.",
      role: "Bought a condo downtown",
      quote: "Maria explained every line of the closing statement before we signed.",
      rating: 5,
    },
    {
      name: "Marcus T.",
      role: "Rented a townhome in Mueller",
      quote: "Sam found us a place that took our dog and handled the application in two days.",
      rating: 5,
    },
  ],
};

export const usDemoPages: SeedPagesCopy = {
  home: [
    {
      type: "testimonials",
      props: {
        eyebrow: "Reviews",
        heading: "What our clients say",
        source: "latest",
        count: 2,
        layout: "grid",
      },
      style: { background: "white" },
    },
    {
      type: "blog_posts",
      props: {
        eyebrow: "Insights",
        heading: "From our blog",
        source: "latest",
        count: 2,
        viewAll: { label: "All articles", href: "/insights" },
      },
      style: { background: "sand" },
    },
    {
      type: "faq",
      props: {
        eyebrow: "Questions",
        heading: "Buying a home: the short answers",
        source: "group",
        group: "buying",
        count: 4,
      },
      style: { background: "white" },
    },
  ],
  pages: [
    {
      title: "About us",
      slug: "about",
      template: "default",
      seoTitle: "About Maple & Main Realty",
      seoDescription: "A small Austin brokerage whose agents tour every home they list.",
      sections: [
        {
          type: "hero_simple",
          props: {
            heading: "Local agents who tour every home",
            subheading:
              "Maple & Main Realty helps people buy, sell and rent in Austin. We only list homes we have walked through ourselves.",
            buttons: [{ label: "Contact us", href: "/contact" }],
          },
          style: { background: "sand" },
        },
        {
          type: "text_image",
          props: {
            eyebrow: "How we work",
            heading: "Toured in person, explained plainly",
            body: doc([
              {
                p: "Before a home goes on our site, one of us tours it, checks the photos match and notes the HOA rules. Each listing shows when it was last checked.",
              },
            ]),
            imageId: "$living",
            imageSide: "right",
            imageShape: "portrait",
          },
        },
        {
          type: "team",
          props: { eyebrow: "The team", heading: "Agents you will meet", source: "all", count: 6 },
        },
      ],
    },
    {
      title: "Contact",
      slug: "contact",
      template: "default",
      seoTitle: "Contact Maple & Main Realty",
      seoDescription: "Call, email or visit our office. An agent replies within one business day.",
      sections: [
        {
          type: "hero_simple",
          props: {
            heading: "Talk to us",
            subheading:
              "Call, email or send the form below: an agent replies within one business day.",
          },
          style: { background: "sand", spacing: "compact" },
        },
        {
          type: "contact_block",
          props: {
            heading: "Our office",
            text: "Showings are by appointment; stop by to talk about the neighborhoods you are considering.",
            showDetails: true,
            showMap: true,
            showForm: true,
            formHeading: "Send us a message",
          },
        },
      ],
    },
    {
      title: "Privacy policy",
      slug: "privacy-policy",
      template: "legal",
      legal: "privacy",
      seoDescription:
        "How this demo agency handles personal data. Sample text: replace it with your own.",
      sections: [legalText("privacy", "Maple & Main Realty")],
    },
    {
      title: "Terms of use",
      slug: "terms",
      template: "legal",
      legal: "terms",
      seoDescription:
        "The terms for using this demo website. Sample text: replace it with your own.",
      sections: [legalText("terms", "Maple & Main Realty")],
    },
    {
      title: "Cookie policy",
      slug: "cookie-policy",
      template: "legal",
      legal: "cookies",
      seoDescription: "The cookies this demo website uses and how to change your choice.",
      sections: [legalText("cookies", "Maple & Main Realty")],
    },
  ],
};
