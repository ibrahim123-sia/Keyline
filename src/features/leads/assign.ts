import "server-only";
import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { agents } from "@/db/schema/people";

export type AssignmentRule = "listing_agent" | "area_match" | "round_robin" | "manual";
export type Assignment = {
  agentId: string;
  how: "listing_agent" | "area_match" | "round_robin";
} | null;

/**
 * Who gets a new lead (09 §3.4): the rule in Settings -> Leads, falling through listing
 * agent -> area match -> round robin; "manual" leaves it for an admin. Among several matches
 * the active agent who was given a lead longest ago goes first (round robin).
 */
export async function chooseAgent(
  db: DbOrTx,
  input: {
    rule: AssignmentRule;
    listingAgentId?: string | null;
    locationIds?: readonly string[];
    now: Date;
  },
): Promise<Assignment> {
  if (input.rule === "manual") return null;
  const agency = currentAgencyId();
  const pick = async (assignment: NonNullable<Assignment>) => {
    await db
      .update(agents)
      .set({ lastAssignedAt: input.now })
      .where(eq(agents.id, assignment.agentId));
    return assignment;
  };

  if (input.rule === "listing_agent" && input.listingAgentId) {
    const res = await db.execute<{ id: string }>(sql`
      select id from agents
      where id = ${input.listingAgentId} and agency_id = ${agency} and is_active`);
    if (res.rows[0]) return pick({ agentId: res.rows[0].id, how: "listing_agent" });
  }

  const locationIds = input.locationIds ?? [];
  if (input.rule !== "round_robin" && locationIds.length > 0) {
    // Agents covering one of the locations or an area above it (a district covers its buildings).
    const res = await db.execute<{ id: string }>(sql`
      with recursive up as (
        select id, parent_id from locations
        where agency_id = ${agency}
          and id in (${sql.join(
            locationIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
        union
        select l.id, l.parent_id from locations l join up on l.id = up.parent_id
      )
      select a.id from agents a
      where a.agency_id = ${agency} and a.is_active and a.areas && array(select id from up)
      order by a.last_assigned_at asc nulls first, a.sort_order, a.id
      limit 1`);
    if (res.rows[0]) return pick({ agentId: res.rows[0].id, how: "area_match" });
  }

  const res = await db.execute<{ id: string }>(sql`
    select id from agents
    where agency_id = ${agency} and is_active
    order by last_assigned_at asc nulls first, sort_order, id
    limit 1`);
  return res.rows[0] ? pick({ agentId: res.rows[0].id, how: "round_robin" }) : null;
}
