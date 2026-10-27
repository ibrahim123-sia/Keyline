import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { aiActions } from "@/db/schema/ai";
import { apiTokens } from "@/db/schema/auth";
import { contacts, leads, leadTasks } from "@/db/schema/crm";
import { auditLog } from "@/db/schema/system";
import { patchSettings } from "@/features/settings/mutations";
import { defaultsFor } from "@/features/settings/schema";
import { sha256Hex } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { evalWorldTables, seedEvalWorld, type EvalWorld } from "../ai/fixtures";
import { testAdmin } from "../helpers/admin-context";
import { ensureTestAdminUser, truncate } from "../helpers/db";

const actor = { type: "admin" as const, id: testAdmin.id };
const READ = "lnt_readreadreadreadreadreadreadreadread22";
const PROPOSE = "lnt_proposeproposeproposeproposepropose2";
let world: EvalWorld;
const leadId = newId();
let n = 0;

async function rpc(token: string | null, method: string, params?: unknown) {
  const { POST } = await import("@/app/api/mcp/route");
  n += 1;
  const res = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      // Notifications carry no id (and get no answer).
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(method.startsWith("notifications/") ? {} : { id: n }),
        method,
        params,
      }),
    }),
  );
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}

/** A tool's answer (the JSON inside the text content). */
async function call(token: string, name: string, args: unknown = {}) {
  const { body } = await rpc(token, "tools/call", { name, arguments: args });
  const result = body.result as { content: Array<{ text: string }>; isError?: boolean };
  return { data: JSON.parse(result.content[0]!.text), isError: Boolean(result.isError) };
}

describe("MCP server (10 §4)", () => {
  beforeEach(async () => {
    await truncate(
      ...evalWorldTables,
      "api_tokens",
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "ai_actions",
      "audit_log",
      "rate_limits",
    );
    await ensureTestAdminUser();
    const db = await getDb();
    world = await seedEvalWorld(db);
    await patchSettings(
      db,
      "integrations",
      { ai: { ...defaultsFor("integrations").ai, enabled: true, provider: "mock" } },
      actor,
    );
    for (const [token, scopes] of [
      [READ, ["read"]],
      [PROPOSE, ["read", "propose"]],
    ] as const)
      await db.insert(apiTokens).values({
        userId: testAdmin.id,
        name: token.slice(4, 8),
        tokenHash: await sha256Hex(token),
        tokenPrefix: token.slice(0, 8),
        scopes: [...scopes],
      });
    const contactId = newId();
    await db.insert(contacts).values({ id: contactId, name: "Sara Khan" });
    await db.insert(leads).values({ id: leadId, contactId, source: "form" });
  });

  it("needs a valid token and the MCP switch", async () => {
    expect((await rpc(null, "ping")).status).toBe(401);
    expect((await rpc("lnt_wrongwrongwrongwrongwrongwrongwrong22", "ping")).status).toBe(401);
    const db = await getDb();
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.name, "read"));
    expect((await rpc(READ, "ping")).status).toBe(401);
    await patchSettings(
      db,
      "ai",
      { features: { ...defaultsFor("ai").features, mcp: false } },
      actor,
    );
    expect((await rpc(PROPOSE, "ping")).status).toBe(403);
  });

  it("initialize, then read tools for a read token and write tools only with propose", async () => {
    const init = await rpc(READ, "initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    expect(init.body.result).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "propel" },
    });
    expect((await rpc(READ, "notifications/initialized")).status).toBe(202);

    const readList = (await rpc(READ, "tools/list")).body.result.tools as Array<{ name: string }>;
    expect(readList.map((t) => t.name)).toContain("query_leads");
    expect(readList.map((t) => t.name)).not.toContain("create_task");
    expect(readList.map((t) => t.name)).not.toContain("confirm_action");
    const proposeList = (await rpc(PROPOSE, "tools/list")).body.result.tools as Array<{
      name: string;
      inputSchema: { type: string };
    }>;
    expect(proposeList.map((t) => t.name)).toEqual(
      expect.arrayContaining(["create_task", "confirm_action", "list_pending_actions"]),
    );
    expect(proposeList.every((t) => t.inputSchema.type === "object")).toBe(true);

    const listing = await call(READ, "get_listing", {
      reference: world.listings.hillsVilla.reference,
    });
    expect(listing.data).toMatchObject({ found: true, title: world.listings.hillsVilla.title });
    // A read token cannot reach a write tool even by name.
    expect((await call(READ, "create_task", { leadId, title: "x" })).isError).toBe(true);
    expect((await rpc(READ, "nope")).body.error.code).toBe(-32601);
  });

  it("write tools stay pending until confirmed, and confirming is audited", async () => {
    const db = await getDb();
    const proposed = await call(PROPOSE, "create_task", { leadId, title: "Call Sara back" });
    expect(proposed.data).toMatchObject({
      status: "proposed",
      preview: { task: "Call Sara back" },
    });
    expect(await db.select().from(leadTasks)).toHaveLength(0);
    const [row] = await db.select().from(aiActions);
    expect(row).toMatchObject({ status: "proposed", source: "mcp", adminId: testAdmin.id });
    expect((await call(PROPOSE, "list_pending_actions")).data.pending).toHaveLength(1);

    const confirmed = await call(PROPOSE, "confirm_action", { actionId: proposed.data.actionId });
    expect(confirmed.data).toMatchObject({ status: "executed" });
    expect(await db.select().from(leadTasks)).toHaveLength(1);
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "ai.create_task"));
    expect(audit).toMatchObject({ actorType: "ai", confirmedBy: testAdmin.id });
    // Once only.
    expect(
      (await call(PROPOSE, "confirm_action", { actionId: proposed.data.actionId })).isError,
    ).toBe(true);
  });
});
