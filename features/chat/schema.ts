import { z } from "zod";

/** The website chat (09 §1 #3). Client-safe. */
export const chatStartSchema = z.object({
  name: z.string().trim().max(80, "Use at most 80 characters").default(""),
  email: z.union([z.email("Enter a valid email address").max(160), z.literal("")]).default(""),
  phone: z.string().trim().max(30, "That number is too long").default(""),
  message: z.string().trim().min(1, "Write your message").max(2000, "Use at most 2,000 characters"),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).default(""),
});
export type ChatStartInput = z.input<typeof chatStartSchema>;

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, "Write your message").max(2000, "Use at most 2,000 characters"),
  website: z.string().max(200).default(""),
});

export type ChatMessage = {
  id: string;
  mine: boolean;
  sender: "customer" | "ai" | "admin" | "system";
  body: string;
  createdAt: string;
};
