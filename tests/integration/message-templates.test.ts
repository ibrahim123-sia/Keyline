import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { messageTemplates } from "@/db/schema/crm";
import { auditLog, emailLog } from "@/db/schema/system";
import { captureLead } from "@/features/leads/capture";
import {
  resetMessageTemplate,
  saveMessageTemplate,
  saveWhatsappMapping,
} from "@/features/messages/actions";
import { templatesForAdmin } from "@/features/messages/admin";
import { patchSettings } from "@/features/settings/mutations";
import { loadSettings } from "@/features/settings/queries";
import { runDueJobs } from "@/jobs/runner";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function autoReplies() {
  for (let i = 0; i < 5; i++) if ((await runDueJobs()).ran === 0) break;
  const db = await getDb();
  return (await db.select().from(emailLog)).filter((m) => m.template === "lead.auto_reply");
}

describe("message templates editor (13 §1)", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    adminState.signedInAt = undefined;
    await truncate(
      "message_templates",
      "contacts",
      "leads",
      "lead_events",
      "email_log",
      "job_runs",
      "settings",
      "audit_log",
    );
    await patchSettings(await getDb(), "general", { agencyName: "Haven & Dune" }, actor);
  });
  afterEach(() => {
    adminState.signedInAt = undefined;
  });

  it("the agency's wording is used, can be turned off and reset; changes are audited", async () => {
    const db = await getDb();
    expect(
      await saveMessageTemplate({
        key: "lead.auto_reply",
        channel: "email",
        subject: "Hi {{name}}, {{agency}} here",
        body: "We'll call you today.",
      }),
    ).toMatchObject({ ok: true });
    await captureLead(db, {
      source: "form",
      contact: { name: "Mina Park", email: "mina@example.com" },
    });
    expect((await autoReplies()).map((m) => m.subject)).toEqual(["Hi Mina, Haven & Dune here"]);

    // Off: nothing is sent.
    await saveMessageTemplate({
      key: "lead.auto_reply",
      channel: "email",
      subject: "Hi {{name}}",
      body: "x",
      isActive: false,
    });
    await captureLead(db, { source: "form", contact: { name: "Lee", email: "lee@example.com" } });
    expect(await autoReplies()).toHaveLength(1);

    // Reset: the built-in wording again, and on.
    expect(await resetMessageTemplate({ key: "lead.auto_reply", channel: "email" })).toMatchObject({
      ok: true,
    });
    expect(await db.select().from(messageTemplates)).toEqual([]);
    await captureLead(db, { source: "form", contact: { name: "Rana", email: "rana@example.com" } });
    expect((await autoReplies()).at(-1)!.subject).toBe("Thanks, Rana. We have your message");

    const actions = (await db.select({ action: auditLog.action }).from(auditLog))
      .map((a) => a.action)
      .filter((a) => a.startsWith("message_template"));
    expect(actions.sort()).toEqual([
      "message_template.create",
      "message_template.reset",
      "message_template.update",
    ]);
    const rows = await templatesForAdmin(db);
    expect(rows.find((r) => r.key === "lead.auto_reply")?.email?.custom).toBeNull();
  });

  it("checks the variables and the channel; read-only admins only look", async () => {
    expect(
      await saveMessageTemplate({
        key: "lead.auto_reply",
        channel: "email",
        subject: "Hi {{nmae}}",
        body: "ok",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { subject: [expect.stringContaining("{{nmae}}")] } });
    expect(
      await saveMessageTemplate({ key: "lead.new_message", channel: "whatsapp", body: "x" }),
    ).toMatchObject({ ok: false, fieldErrors: { channel: expect.any(Array) } });
    adminState.user = { ...testAdmin, readOnly: true };
    expect(
      await saveMessageTemplate({
        key: "lead.auto_reply",
        channel: "email",
        subject: "a",
        body: "b",
      }),
    ).toMatchObject({ ok: false });
  });

  it("the approved WhatsApp template is kept with the WhatsApp settings and needs a recent sign-in", async () => {
    const db = await getDb();
    adminState.signedInAt = new Date(Date.now() - 60 * 60_000);
    expect(
      await saveWhatsappMapping({
        key: "lead.auto_reply",
        name: "lead_auto_reply",
        language: "en",
        variables: ["name", "agent"],
      }),
    ).toMatchObject({ ok: false, code: "REAUTH_REQUIRED" });

    adminState.signedInAt = undefined;
    expect(
      await saveWhatsappMapping({
        key: "lead.auto_reply",
        name: "lead_auto_reply",
        language: "en",
        variables: ["name", "agent"],
      }),
    ).toEqual({ ok: true, data: { key: "lead.auto_reply", mapped: true } });
    expect((await loadSettings("integrations", db)).whatsapp.templates["lead.auto_reply"]).toEqual({
      name: "lead_auto_reply",
      language: "en",
      variables: ["name", "agent"],
    });
    expect(
      await saveWhatsappMapping({
        key: "lead.auto_reply",
        name: "x",
        language: "en",
        variables: ["nope"],
      }),
    ).toMatchObject({ ok: false, fieldErrors: { variables: expect.any(Array) } });
    await saveWhatsappMapping({ key: "lead.auto_reply", name: "", language: "", variables: [] });
    expect(
      (await loadSettings("integrations", db)).whatsapp.templates["lead.auto_reply"],
    ).toBeUndefined();
  });
});
