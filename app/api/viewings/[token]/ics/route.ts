import { connection } from "next/server";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { viewingIcs } from "@/features/viewings/ics";
import { viewingByToken } from "@/features/viewings/manage";

/** The viewing's calendar invite (09 §5 ".ics invite"), from its private link. */
export async function GET(_request: Request, ctx: RouteContext<"/api/viewings/[token]/ics">) {
  await connection();
  const { token } = await ctx.params;
  const db = await getDb();
  const row = await viewingByToken(db, token);
  if (!row) return new Response("Not found", { status: 404 });
  const { viewing: v, property, project } = row;
  const general = await loadSettings("general", db);
  const what = property
    ? `${property.reference} · ${property.title}`
    : (project?.name ?? "Viewing");
  const host = new URL(siteUrl("/")).host;
  const body = viewingIcs({
    uid: `${v.id}@${host}`,
    start: v.startsAt,
    end: v.endsAt,
    summary: `Viewing: ${what} (${general.agencyName})`,
    description: [
      v.type === "video" ? "Video tour" : "In person",
      v.meetingUrl,
      `Change or cancel: ${siteUrl(`/viewings/${token}`)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    url: siteUrl(`/viewings/${token}`),
    cancelled: v.status === "cancelled",
    // Each change of time makes a newer version of the event.
    sequence: Math.floor((v.updatedAt.getTime() - v.createdAt.getTime()) / 1000),
    now: new Date(),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="viewing.ics"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
