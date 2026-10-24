/**
 * Funnel steps (09 §7 "lead -> contacted -> viewing -> offer -> won") and how the agency's own
 * pipeline maps onto them. Stage names are editable (Settings -> Leads), so the mapping uses
 * each stage's kind and its place in the pipeline, never its name:
 *
 * - a "won" stage is Won; a "lost" stage says nothing on its own (the lead's history does);
 * - open stages in pipeline order: the first is Lead, the last is Offer (with three or more
 *   open stages), the second is Contacted, and any stages in between are Viewing.
 *   The default pipeline New, Contacted, Viewing, Offer maps one to one.
 *
 * A lead counts as having reached the furthest step shown by any of: its current stage, any
 * stage it was moved to before (the timeline), a first reply (Contacted), a viewing that was
 * not cancelled (Viewing), and being won (Won). Steps are cumulative: a won lead also counts
 * as contacted, viewed and offered, so each step is never larger than the one before.
 */
export const funnelSteps = ["lead", "contacted", "viewing", "offer", "won"] as const;
export type FunnelStep = (typeof funnelSteps)[number];

export const STEP = {
  lead: 0,
  contacted: 1,
  viewing: 2,
  offer: 3,
  won: 4,
} as const satisfies Record<FunnelStep, number>;

export type PipelineStage = { id: string; kind: "open" | "won" | "lost"; sortOrder: number };

/** Stage id -> the funnel step rank it proves (lost stages are left out). */
export function stageStepRanks(stages: PipelineStage[]): Map<string, number> {
  const ranks = new Map<string, number>();
  const open = stages.filter((s) => s.kind === "open").sort((a, b) => a.sortOrder - b.sortOrder);
  open.forEach((s, i) => {
    let rank: number;
    if (i === 0) rank = STEP.lead;
    else if (open.length >= 3 && i === open.length - 1) rank = STEP.offer;
    else if (i === 1) rank = STEP.contacted;
    else rank = STEP.viewing;
    ranks.set(s.id, rank);
  });
  for (const s of stages) if (s.kind === "won") ranks.set(s.id, STEP.won);
  return ranks;
}

/** The furthest step a lead reached, from the evidence above. */
export function reachedStep(evidence: {
  stageRanks: Array<number | undefined>;
  answered: boolean;
  hasViewing: boolean;
  won: boolean;
}): number {
  let reached: number = STEP.lead;
  for (const r of evidence.stageRanks) if (r !== undefined && r > reached) reached = r;
  if (evidence.answered) reached = Math.max(reached, STEP.contacted);
  if (evidence.hasViewing) reached = Math.max(reached, STEP.viewing);
  if (evidence.won) reached = STEP.won;
  return reached;
}

/** Leads at or beyond each step, from each lead's furthest step. */
export function funnelCounts(reached: number[]): Record<FunnelStep, number> {
  return Object.fromEntries(
    funnelSteps.map((step) => [step, reached.filter((r) => r >= STEP[step]).length]),
  ) as Record<FunnelStep, number>;
}
