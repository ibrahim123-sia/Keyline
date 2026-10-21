import type { SeedContent } from "../content";

/**
 * Haven & Dune demo content: general guidance, written to be useful without inventing
 * facts. Numbers on the area guides are marked as sample figures for the demo.
 */
const SAMPLE = "Sample figure for the demo; check current data before relying on it";

export const havenDuneContent: SeedContent = {
  categories: [
    { key: "buying", name: "Buying", description: "Costs, steps and checks when you buy a home." },
    {
      key: "renting",
      name: "Renting",
      description: "Finding, signing for and living in a rented home.",
    },
    { key: "off-plan", name: "Off-plan", description: "Buying before the building is finished." },
    { key: "market", name: "Market notes", description: "How we read prices and demand." },
  ],

  posts: [
    {
      title: "What service charges pay for",
      excerpt: "Where the yearly fees on an apartment go, and what to ask before you buy.",
      category: "buying",
      tags: ["Service charges", "Fees"],
      author: "layla-haddad",
      daysAgo: 4,
      cover: "tower",
      relatedArea: "marina",
      body: [
        {
          p: "Every apartment in a shared building pays a yearly service charge. It covers the parts of the building nobody owns alone: the lobby, lifts, pool, gym, security and the reserve kept for large repairs.",
        },
        { h: "What is usually included" },
        {
          list: [
            "Cleaning and upkeep of shared areas",
            "Security staff and cameras",
            "Lifts, pumps and air conditioning plant",
            "Building insurance",
            "A reserve fund for future repairs",
          ],
        },
        { h: "How the amount is set" },
        {
          p: "Charges are usually set per square foot of the unit, so a larger home pays more. The rate differs from building to building and can change from year to year.",
        },
        {
          table: [
            ["Example unit", "Size", "Example rate", "Example yearly charge"],
            ["Studio", "450 sq ft", "15 per sq ft", "6,750"],
            ["Two bedrooms", "1,200 sq ft", "15 per sq ft", "18,000"],
          ],
        },
        { p: "The table is an example of the sum, not the rate of any real building." },
        {
          quote:
            "Ask for the last three years of service charge statements before you make an offer.",
        },
        {
          p: "A sudden jump between years, or a small reserve fund in an older building, are worth a question. Your agent can request the figures from the owners' association.",
        },
        { listing: "marina" },
        { cta: { label: "Ask us about a building", href: "/contact" } },
      ],
    },
    {
      title: "Reading an off-plan payment plan",
      excerpt: "What 60/40 or post-handover means, and how to plan the payments.",
      category: "off-plan",
      tags: ["Off-plan", "Payment plans"],
      author: "omar-siddiqui",
      daysAgo: 11,
      cover: "living",
      relatedArea: "creek",
      body: [
        {
          p: "When you buy off-plan, you pay the developer in steps instead of all at once. The payment plan lists those steps: how much, and when.",
        },
        { h: "The common shapes" },
        {
          list: [
            "60/40: 60% paid during construction, 40% at handover",
            "50/50: half during construction, half at handover",
            "Post-handover: part of the price is paid in instalments after you get the keys",
          ],
        },
        {
          p: "During construction, payments are often tied to progress, for example 10% when the frame is complete. Check whether a step is tied to a date or to a construction milestone.",
        },
        { h: "Questions worth asking" },
        {
          list: [
            "Is the deposit refundable, and under what conditions?",
            "Which fees are due at booking, apart from the deposit?",
            "What happens if handover is late?",
            "Can the plan be transferred if you sell before handover?",
          ],
        },
        { listing: "creek" },
        { cta: { label: "See off-plan projects", href: "/off-plan" } },
      ],
    },
    {
      title: "Renting your first apartment: a checklist",
      excerpt: "Documents, viewings, the contract and the deposit, step by step.",
      category: "renting",
      tags: ["Renting", "Checklists"],
      author: "layla-haddad",
      daysAgo: 19,
      cover: "bedroom",
      relatedArea: "jvc",
      body: [
        {
          p: "Renting goes smoothly when the paperwork is ready before you find the right home. Good homes often go to the first tenant who can sign.",
        },
        { h: "Before viewings" },
        {
          list: [
            "A copy of your passport and residence visa",
            "Your employment letter or salary certificate",
            "How you will pay: one cheque or several",
          ],
        },
        { h: "At the viewing" },
        {
          list: [
            "Run the taps and the air conditioning",
            "Check the water pressure and any signs of damp",
            "Ask what is included: parking, white goods, maintenance",
          ],
        },
        { h: "Signing" },
        {
          p: "Read the contract before paying the deposit. Note the rent, the number of payments, the notice period and who pays for which repairs. Take dated photos of the home on the day you move in.",
        },
        { cta: { label: "Homes to rent", href: "/rent" } },
      ],
    },
    {
      title: "How we price a home for sale",
      excerpt: "The comparable sales and listings behind our asking price advice.",
      category: "market",
      tags: ["Selling", "Valuation"],
      daysAgo: 32,
      cover: "pool",
      relatedArea: "hills",
      body: [
        {
          p: "An asking price is a judgement, not a formula. We start from what similar homes sold for recently and what is on the market now, then adjust for the differences.",
        },
        { h: "What we compare" },
        {
          list: [
            "Recent sales of similar homes in the same community",
            "Homes listed now, and how long they have been listed",
            "Floor, view, condition and upgrades",
            "Service charges and any tenancy in place",
          ],
        },
        {
          quote:
            "A price that is too high costs time; most interest comes in the first weeks of a listing.",
        },
        {
          p: "We share the comparables with you, so you can see how we reached the figure, and we review it with you if viewings or offers tell us something new.",
        },
        { cta: { label: "Talk to us about selling", href: "/contact" } },
      ],
    },
    {
      title: "Moving in: the first week",
      excerpt: "Utilities, access cards, the move itself and the small things that help.",
      category: "renting",
      tags: ["Renting", "Checklists"],
      author: "omar-siddiqui",
      daysAgo: 46,
      cover: "kitchen",
      body: [
        {
          p: "Most of a smooth move happens before the van arrives. A few calls in the week before save days afterwards.",
        },
        {
          list: [
            "Book the move-in slot and lift with the building",
            "Open the electricity and water account in your name",
            "Arrange internet early; installation can take a few days",
            "Collect access cards and parking stickers",
            "Read the meters on the first day and keep a photo",
          ],
        },
        {
          p: "Keep the contract, the inventory and the meter photos together. You will want them again when you move out.",
        },
      ],
    },
    {
      title: "Mortgage basics for first-time buyers",
      excerpt: "Deposit, approval in principle and the costs on top of the price.",
      category: "buying",
      tags: ["Mortgages", "Fees"],
      daysAgo: 60,
      cover: "villa",
      relatedArea: "downtown",
      body: [
        {
          p: "A mortgage lets you spread the cost of a home over many years. Before you look at homes, it helps to know what a lender will offer you.",
        },
        { h: "Approval in principle" },
        {
          p: "A lender looks at your income, commitments and credit history and tells you how much it is likely to lend. It is not a final offer, but sellers take you more seriously with one.",
        },
        { h: "The money you need up front" },
        {
          list: [
            "The deposit: the part of the price the mortgage does not cover",
            "Registration and transfer fees",
            "Agency fees",
            "Valuation and arrangement fees from the lender",
          ],
        },
        {
          p: "Rates and rules change, so check the current figures with a bank or a mortgage adviser before you commit.",
        },
        { cta: { label: "Homes for sale", href: "/buy" } },
      ],
    },
  ],

  guides: [
    {
      location: "marina",
      intro:
        "Towers along a long waterfront promenade, with the beach a short walk away. Popular with people who want to walk to cafés, the water and the metro.",
      cover: "tower",
      photos: [
        { picture: "tower", caption: "Towers along the water" },
        { picture: "pool", caption: "Pool decks are common in the towers" },
      ],
      highlights: [
        "Waterfront promenade for walks and runs",
        "Beach within walking distance",
        "Metro and tram stops",
        "Cafés and restaurants at street level",
      ],
      stats: [
        { label: "Metro stations nearby", value: "2", source: SAMPLE },
        { label: "Typical walk to the beach", value: "10 min", source: SAMPLE },
      ],
      faqs: [
        {
          q: "Is Dubai Marina good for families?",
          a: "Many families live here, mostly in the larger apartments. Schools are a short drive away rather than a walk, so ask us about the school run from a particular tower.",
        },
        {
          q: "Is parking included?",
          a: "Most apartments come with at least one parking space. Check the title deed or tenancy contract for the space number.",
        },
      ],
      relatedPosts: [0],
      body: [
        { h: "Living here" },
        {
          p: "Life centres on the promenade. Homes range from studios to large penthouses, and the view, the floor and the distance to the metro make the biggest differences in price.",
        },
        { listing: "marina" },
      ],
    },
    {
      location: "downtown",
      intro:
        "The busy centre around the tallest tower and the large mall: apartments close to offices, shops and events.",
      cover: "living",
      photos: [{ picture: "living", caption: "Apartments with city views" }],
      highlights: [
        "Walk to the mall and the boulevard",
        "Close to the business districts",
        "Events and fireworks on the doorstep",
      ],
      stats: [
        { label: "Share of apartments with a city view", value: "About half", source: SAMPLE },
        { label: "Drive to the airport", value: "15 min", source: SAMPLE },
      ],
      faqs: [
        {
          q: "Is it noisy?",
          a: "Parts near the boulevard are lively in the evenings and during events. Higher floors and homes facing away from the main roads are quieter.",
        },
        {
          q: "Who usually lives here?",
          a: "Professionals and couples, with some families in the larger apartments.",
        },
      ],
      relatedPosts: [5],
      body: [
        { h: "Living here" },
        {
          p: "Downtown suits people who want the city at the door. Ask about service charges: they differ a lot between buildings with the same views.",
        },
      ],
    },
    {
      location: "jvc",
      intro:
        "A community of mid-rise buildings and townhouses with parks in each district, known for more space for the money.",
      cover: "villa",
      photos: [{ picture: "villa", caption: "Townhouses around a park" }],
      highlights: [
        "Parks and play areas in each district",
        "Larger homes for the price",
        "Good road links to the main highways",
      ],
      stats: [{ label: "Parks in the community", value: "30+", source: SAMPLE }],
      faqs: [
        {
          q: "Do I need a car?",
          a: "Mostly yes. There are buses, but most residents drive to work and to the metro.",
        },
        {
          q: "Is it still being built?",
          a: "Some plots are still under construction, so check what is planned next to a building before you choose.",
        },
      ],
      relatedPosts: [2, 4],
      body: [
        { h: "Living here" },
        {
          p: "JVC is popular with first-time buyers and young families. Newer buildings often have pools and gyms; older ones can be better value.",
        },
        { listing: "jvc" },
      ],
    },
    {
      location: "palm",
      intro:
        "Villas and beachfront apartments on the island, with private beaches and hotels along the edge.",
      cover: "pool",
      photos: [
        { picture: "pool", caption: "Beach-front pools" },
        { picture: "villa", caption: "Villas on the fronds" },
      ],
      highlights: [
        "Private beaches with many homes",
        "Hotels and restaurants along the crescent",
        "Monorail along the trunk",
      ],
      stats: [{ label: "Kilometres of beach", value: "Over 50", source: SAMPLE }],
      faqs: [
        {
          q: "Are villas on the fronds all the same?",
          a: "No. Plot size, beach width and the view across the water vary a lot, and so do prices.",
        },
        {
          q: "Can I rent out my home for short stays?",
          a: "Holiday letting needs a permit and building approval. Ask us before you buy if you plan to let it.",
        },
      ],
      relatedPosts: [3],
      body: [
        { h: "Living here" },
        {
          p: "Villas on the fronds offer space and privacy; apartments on the trunk are closer to shops and the monorail.",
        },
      ],
    },
  ],

  faqs: [
    {
      group: "buying",
      q: "Can foreigners buy property here?",
      a: "Yes, in the areas set aside for freehold ownership. We only list homes you can legally buy.",
    },
    {
      group: "buying",
      q: "What costs come on top of the price?",
      a: "Usually the registration fee, the agency fee and, with a mortgage, the lender's fees. We give you an estimate with every offer.",
    },
    {
      group: "buying",
      q: "How long does buying take?",
      a: "A cash purchase can complete in a few weeks. With a mortgage, allow more time for the valuation and the bank's approval.",
    },
    {
      group: "buying",
      q: "Do you check the title deed?",
      a: "Yes. We check ownership and any mortgage on the home before you sign.",
    },
    {
      group: "renting",
      q: "How is the rent paid?",
      a: "Often by cheques spread over the year. Some landlords accept monthly payments; we ask for you.",
    },
    {
      group: "renting",
      q: "How much is the deposit?",
      a: "It is set in the contract, commonly a percentage of the yearly rent. It is returned at the end, minus any agreed repair costs.",
    },
    {
      group: "renting",
      q: "Who pays for repairs?",
      a: "The contract says who pays for what. As a rule, the landlord covers major repairs and the tenant minor upkeep.",
    },
    {
      group: "off_plan",
      q: "What if the project is delayed?",
      a: "Read the contract's handover clause. It sets the expected date and what happens if it passes.",
    },
    {
      group: "off_plan",
      q: "Can I sell before handover?",
      a: "Often yes, once a set share of the price is paid. The developer's rules and fees apply.",
    },
    {
      group: "selling",
      q: "How do you set the asking price?",
      a: "From recent sales and current listings of similar homes, adjusted for the differences. We show you the comparables.",
    },
    {
      group: "selling",
      q: "Do I need to be there for viewings?",
      a: "No. We hold the keys and show the home, and we tell you how each viewing went.",
    },
    {
      group: "general",
      q: "How do I book a viewing?",
      a: "Use the form on any listing, or message us on WhatsApp. We confirm a time that suits you.",
    },
  ],

  testimonials: [
    {
      name: "Aisha R.",
      role: "Bought an apartment in Dubai Marina",
      quote:
        "Layla showed us the service charge history before we offered, which helped us pick the right building.",
      rating: 5,
    },
    {
      name: "Tom B.",
      role: "Rented in JVC",
      quote: "Quick replies, and the contract was explained line by line before we paid anything.",
      rating: 5,
    },
    {
      name: "Priya S.",
      role: "Sold a townhouse",
      quote:
        "The price advice came with the comparable sales, so we understood it. We agreed an offer within a month.",
      rating: 4,
    },
    {
      name: "Daniel K.",
      role: "Bought off-plan",
      quote:
        "Omar walked us through the payment plan and the handover clause. No surprises so far.",
      rating: 5,
    },
    {
      name: "Mariam H.",
      role: "Landlord, Downtown",
      quote:
        "They found tenants and handled the move-in inventory with photos. I hardly had to be involved.",
      rating: 4,
    },
    {
      name: "Leo F.",
      role: "Rented on the Palm",
      quote: "Straight answers about what was and was not included. Viewings were on time.",
      rating: null,
    },
  ],
};
