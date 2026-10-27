import { and, asc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { mediaUrl } from "@/features/media/queries";
import type { Usage } from "@/lib/usage-registry";
import type { AgentInput } from "./schema";
import { agentUsage } from "./usage";

export type AgentRow = {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  isActive: boolean;
  photoUrl: string | null;
  photoColor: string | null;
  calendarConnected: boolean;
  usage: Usage;
  data: AgentInput;
};

/** Every agent profile in team-page order, for Setup -> Agents. */
export async function listAgentsForAdmin(db?: DbOrTx): Promise<AgentRow[]> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select({
      agent: agents,
      photoKey: media.r2Key,
      photoStatus: media.status,
      photoColor: media.dominantColor,
    })
    .from(agents)
    .leftJoin(media, eq(media.id, agents.photoId))
    .where(eq(agents.agencyId, currentAgencyId()))
    .orderBy(asc(agents.sortOrder), asc(agents.name));
  const usage = await agentUsage(
    conn,
    rows.map((r) => r.agent.id),
  );
  return rows.map(({ agent: a, photoKey, photoStatus, photoColor }) => ({
    id: a.id,
    name: a.name,
    slug: a.slug,
    title: a.title,
    isActive: a.isActive,
    photoUrl: photoKey && photoStatus === "ready" ? mediaUrl(photoKey) : null,
    photoColor,
    calendarConnected: a.calendarConnected,
    usage: usage.get(a.id) ?? { total: 0, parts: [] },
    data: {
      name: a.name,
      slug: a.slug,
      title: a.title,
      photoId: a.photoId,
      phone: a.phone,
      whatsapp: a.whatsapp,
      email: a.email,
      languages: a.languages,
      areas: a.areas,
      bio: a.bio,
      replyTimeText: a.replyTimeText,
      workingHours: a.workingHours
        ? {
            mon: a.workingHours.mon ?? [],
            tue: a.workingHours.tue ?? [],
            wed: a.workingHours.wed ?? [],
            thu: a.workingHours.thu ?? [],
            fri: a.workingHours.fri ?? [],
            sat: a.workingHours.sat ?? [],
            sun: a.workingHours.sun ?? [],
          }
        : null,
      isActive: a.isActive,
      seoTitle: a.seoTitle,
      seoDescription: a.seoDescription,
      canonicalUrl: a.canonicalUrl,
      noindex: a.noindex,
      ogImageId: a.ogImageId,
    },
  }));
}

export async function getAgentForAdmin(id: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.agencyId, currentAgencyId())));
  return row ?? null;
}
