/**
 * The suggested next step on the lead page (09 §4 right panel), by simple rules in order of
 * urgency. Phase 9 lets the AI suggest one when it is on. Pure.
 */
export type NextStepInput = {
  status: "open" | "won" | "lost";
  name: string;
  answered: boolean;
  /** Minutes since the lead came in (for "waiting"). */
  waitingMinutes: number;
  overdueTask: { title: string } | null;
  upcomingViewing: { startsAt: Date } | null;
  /** A viewing done without feedback yet. */
  viewingDoneNoFeedback: boolean;
  matchingCount: number;
  shortlistSent: boolean;
  daysSinceActivity: number;
  /** Settings -> Leads followUpAfterDays (0 = off). */
  followUpAfterDays: number;
  hasPhone: boolean;
};

export type NextStep = { key: string; text: string };

const dayFormat = new Intl.DateTimeFormat("en", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function suggestNextStep(i: NextStepInput): NextStep {
  const first = i.name.split(/\s+/)[0] || i.name;
  if (i.status !== "open") return { key: "closed", text: "Nothing to do: this lead is closed." };
  if (!i.answered)
    return {
      key: "first_reply",
      text:
        i.waitingMinutes >= 1
          ? `Reply first: ${first} has waited ${i.waitingMinutes < 120 ? `${i.waitingMinutes} min` : `${Math.round(i.waitingMinutes / 60)} h`}. ${i.hasPhone ? "A call works best." : "Send an email."}`
          : `Reply to ${first} now. ${i.hasPhone ? "A call works best." : "Send an email."}`,
    };
  if (i.overdueTask)
    return { key: "overdue_task", text: `Do the overdue task: ${i.overdueTask.title}.` };
  if (i.upcomingViewing)
    return {
      key: "confirm_viewing",
      text: `Confirm the viewing on ${dayFormat.format(i.upcomingViewing.startsAt)} with ${first}.`,
    };
  if (i.viewingDoneNoFeedback)
    return {
      key: "viewing_feedback",
      text: `Ask ${first} how the viewing went, and suggest similar homes.`,
    };
  if (!i.shortlistSent && i.matchingCount > 0)
    return {
      key: "send_matches",
      text: `Send ${first} the ${i.matchingCount === 1 ? "matching home" : `${i.matchingCount} matching homes`}.`,
    };
  if (i.followUpAfterDays > 0 && i.daysSinceActivity >= i.followUpAfterDays)
    return {
      key: "follow_up",
      text: `Follow up: no contact for ${i.daysSinceActivity} ${i.daysSinceActivity === 1 ? "day" : "days"}.`,
    };
  return { key: "book_viewing", text: `Offer ${first} a viewing.` };
}
