import {
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Libre_Baskerville,
  Lora,
  Manrope,
  Nunito_Sans,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Work_Sans,
} from "next/font/google";

/**
 * Self-hosted fonts (next/font, no layout shift). The admin picks one display and one body
 * font in Settings -> Branding; every option is declared here because next/font works at
 * build time. Browsers only download the files of the fonts the page actually uses.
 */

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-serif",
  display: "swap",
  preload: false,
});
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-baskerville",
  display: "swap",
  preload: false,
});

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  preload: false,
});
const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  display: "swap",
  preload: false,
});
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
  display: "swap",
  preload: false,
});

export const fontVariableClasses = [
  fraunces,
  playfair,
  cormorant,
  dmSerif,
  lora,
  baskerville,
  manrope,
  inter,
  dmSans,
  jakarta,
  workSans,
  nunitoSans,
]
  .map((f) => f.variable)
  .join(" ");
