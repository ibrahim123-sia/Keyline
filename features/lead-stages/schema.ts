import { z } from "zod";
import { leadStageKinds } from "@/db/schema/master-data";

/** One CRM pipeline stage (04 §5, 05 `lead_stages`). */
export const leadStageInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #4F6B57"),
    kind: z.enum(leadStageKinds),
  })
  .strict();

export type LeadStageInput = z.infer<typeof leadStageInputSchema>;
export type LeadStageKind = LeadStageInput["kind"];

export const kindLabels: Record<LeadStageKind, string> = {
  open: "Open",
  won: "Counts as won",
  lost: "Counts as lost",
};

/** A working pipeline for a fresh install (market-neutral, every name editable). */
export const defaultLeadStages: LeadStageInput[] = [
  { name: "New", color: "#5B6670", kind: "open" },
  { name: "Contacted", color: "#3E6A8A", kind: "open" },
  { name: "Viewing", color: "#8A6A2E", kind: "open" },
  { name: "Offer", color: "#7A4E8A", kind: "open" },
  { name: "Won", color: "#4F6B57", kind: "won" },
  { name: "Lost", color: "#B4402A", kind: "lost" },
];

/** A pipeline needs somewhere to start, to win and to lose. */
export function pipelineProblem(kinds: LeadStageKind[]): string | null {
  for (const kind of leadStageKinds) {
    if (!kinds.includes(kind)) {
      return `Keep at least one ${kind === "open" ? "open" : kind} stage (a pipeline needs open, won and lost stages).`;
    }
  }
  return null;
}
