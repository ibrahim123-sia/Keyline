import { connection } from "next/server";
import { getDb } from "@/db/client";
import { availableSlots } from "@/features/viewings/availability";
import { bookingTarget } from "@/features/viewings/book";
import { viewingByToken } from "@/features/viewings/manage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Free viewing times (09 §5) for a listing (?property=), a project (?project=) or, to move a
 * booking, the agent of an existing viewing (?viewing=<link token>; its own time counts free).
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const params = new URL(request.url).searchParams;
  const db = await getDb();
  let agentId: string | null = null;
  let except: string | undefined;
  try {
    const token = params.get("viewing");
    const property = params.get("property");
    const project = params.get("project");
    if (token) {
      const row = await viewingByToken(db, token);
      if (!row) return Response.json({ error: "not found" }, { status: 404 });
      agentId = row.viewing.agentId;
      except = row.viewing.id;
    } else if (property && UUID.test(property)) {
      agentId = (await bookingTarget(db, { propertyId: property })).agentId;
    } else if (project && UUID.test(project)) {
      agentId = (await bookingTarget(db, { projectId: project })).agentId;
    } else return Response.json({ error: "bad request" }, { status: 400 });
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const { rules, slots } = await availableSlots(db, agentId, new Date(), except);
  return Response.json(
    {
      timeZone: rules.timeZone,
      lengthMin: rules.lengthMin,
      slots: slots.map((s) => s.start.toISOString()),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
