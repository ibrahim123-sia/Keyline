import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { contacts, leads } from "@/db/schema/crm";
import { patchSettings } from "@/features/settings/mutations";
import { setSecret } from "@/features/settings/secrets";
import { setMetaLeadFetcher } from "@/features/social-forms/capture";
import { hmacSha256Hex } from "@/lib/crypto";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };

async function call(source: string, body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/webhooks/leads/[source]/route");
  const raw = JSON.stringify(body);
  return POST(
    new Request(`http://localhost/api/webhooks/leads/${source}`, {
      method: "POST",
      headers,
      body: raw,
    }),
    {
      params: Promise.resolve({ source }),
    },
  );
}
const metaSig = async (body: unknown, secret = "meta-app-secret") =>
  `sha256=${await hmacSha256Hex(secret, JSON.stringify(body))}`;

describe("social lead form webhooks (09 §1 #18)", () => {
  beforeEach(async () => {
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "settings",
      "secrets",
      "job_runs",
      "audit_log",
    );
    const db = await getDb();
    await patchSettings(db, "market", { phoneCountryCode: "+971" }, actor);
    await patchSettings(
      db,
      "integrations",
      { socialForms: { meta: true, tiktok: true, google: true } },
      actor,
    );
    await setSecret(db, "social_meta_app_secret", "meta-app-secret", actor);
    await setSecret(db, "social_meta_secret", "meta-verify", actor);
    await setSecret(db, "social_tiktok_secret", "tt-secret", actor);
    await setSecret(db, "social_google_secret", "g-key", actor);
  });
  afterEach(() => setMetaLeadFetcher(undefined));

  it("Meta: signed calls only; answers fetched by lead id; campaign saved as the touch; retries once", async () => {
    setMetaLeadFetcher(async (id) =>
      id === "L1"
        ? {
            field_data: [
              { name: "full_name", values: ["Sam Visitor"] },
              { name: "email", values: ["sam@example.com"] },
              { name: "phone_number", values: ["0501234567"] },
              { name: "budget", values: ["AED 1.5M"] },
            ],
            campaign_name: "marina-2bed",
            ad_name: "Carousel 1",
            platform: "fb",
          }
        : null,
    );
    const body = {
      object: "page",
      entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "L1", form_id: "F1" } }] }],
    };
    expect(
      (await call("meta", body, { "x-hub-signature-256": await metaSig(body, "wrong") })).status,
    ).toBe(401);
    const res = await call("meta", body, { "x-hub-signature-256": await metaSig(body) });
    expect(await res.json()).toEqual({ ok: true, captured: 1, skipped: 0 });
    expect(
      await (await call("meta", body, { "x-hub-signature-256": await metaSig(body) })).json(),
    ).toEqual({
      ok: true,
      captured: 0,
      skipped: 1,
    });
    const db = await getDb();
    const [lead] = await db.select().from(leads);
    expect(lead).toMatchObject({
      source: "social_form",
      sourceDetail: "Meta",
      requirements: { budgetMax: 150_000_000, budgetFrom: "lead" },
    });
    expect(lead!.firstTouch).toMatchObject({
      channel: "paid_social",
      utm_source: "facebook",
      utm_campaign: "marina-2bed",
      utm_content: "Carousel 1",
    });
    const [contact] = await db.select().from(contacts);
    expect(contact).toMatchObject({
      name: "Sam Visitor",
      email: "sam@example.com",
      phone: "+971501234567",
    });

    const { GET } = await import("@/app/api/webhooks/leads/[source]/route");
    const verify = await GET(
      new Request(
        "http://localhost/api/webhooks/leads/meta?hub.mode=subscribe&hub.verify_token=meta-verify&hub.challenge=77",
      ),
      { params: Promise.resolve({ source: "meta" }) },
    );
    expect(await verify.text()).toBe("77");
  });

  it("Google: the key in the body; test leads marked; TikTok: HMAC; turned-off sources refuse", async () => {
    const google = {
      lead_id: "G1",
      google_key: "g-key",
      is_test: true,
      campaign_id: 123,
      gcl_id: "gclid-9",
      user_column_data: [
        { column_id: "FULL_NAME", string_value: "Lee Chan" },
        { column_id: "PHONE_NUMBER", string_value: "+971 55 111 2222" },
      ],
    };
    expect((await call("google", { ...google, google_key: "nope" })).status).toBe(401);
    expect(await (await call("google", google)).json()).toMatchObject({ captured: 1 });

    const tiktok = {
      lead_id: "T1",
      campaign_name: "offplan-oct",
      fields: { email: "t@example.com", name: "Tia" },
    };
    expect((await call("tiktok", tiktok, { "x-tiktok-signature": "deadbeef" })).status).toBe(401);
    const sig = await hmacSha256Hex("tt-secret", JSON.stringify(tiktok));
    expect(
      await (await call("tiktok", tiktok, { "x-tiktok-signature": sig })).json(),
    ).toMatchObject({ captured: 1 });

    // A form with no email and no phone cannot become a lead.
    const empty = { lead_id: "T2", fields: { name: "Ghost" } };
    const sig2 = await hmacSha256Hex("tt-secret", JSON.stringify(empty));
    expect(
      await (await call("tiktok", empty, { "x-tiktok-signature": sig2 })).json(),
    ).toMatchObject({ captured: 0, skipped: 1 });

    const db = await getDb();
    const rows = await db
      .select({ sourceDetail: leads.sourceDetail, firstTouch: leads.firstTouch })
      .from(leads);
    expect(rows.map((r) => r.sourceDetail).sort()).toEqual(["Google Ads (test)", "TikTok"]);
    expect(rows.find((r) => r.sourceDetail === "TikTok")!.firstTouch).toMatchObject({
      utm_campaign: "offplan-oct",
      channel: "paid_social",
    });
    expect(rows.find((r) => r.sourceDetail !== "TikTok")!.firstTouch).toMatchObject({
      channel: "paid_search",
      gclid: "gclid-9",
      utm_campaign: "123",
    });

    await patchSettings(
      db,
      "integrations",
      { socialForms: { meta: false, tiktok: false, google: false } },
      actor,
    );
    expect((await call("google", google)).status).toBe(404);
    expect((await call("nope", {})).status).toBe(404);
  });
});
