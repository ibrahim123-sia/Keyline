import { describe, expect, it } from "vitest";
import {
  applyFieldMap,
  googleLead,
  metaFields,
  metaLeadgenEvents,
  parseBudget,
  socialTouch,
  tiktokLeads,
} from "@/features/social-forms/parse";

const map = {
  name: "full_name, first_name",
  email: "email",
  phone: "phone_number",
  budget: "budget",
  message: "message",
};

describe("social lead forms", () => {
  it("maps answers; first and last name join; the rest is kept", () => {
    expect(
      applyFieldMap(
        {
          First_Name: "Sam",
          last_name: "Visitor",
          EMAIL: "Sam@Example.com",
          phone_number: "+971501234567",
          when_to_move: "In 3 months",
        },
        map,
      ),
    ).toEqual({
      name: "Sam Visitor",
      email: "sam@example.com",
      phone: "+971501234567",
      budget: null,
      message: null,
      other: { when_to_move: "In 3 months" },
    });
  });

  it("budgets in words and ranges", () => {
    expect(parseBudget("AED 1,500,000")).toEqual({ min: null, max: 1_500_000 });
    expect(parseBudget("800k - 1.2m")).toEqual({ min: 800_000, max: 1_200_000 });
    expect(parseBudget("2 million")).toEqual({ min: null, max: 2_000_000 });
    expect(parseBudget("ask me")).toEqual({ min: null, max: null });
  });

  it("reads Meta, Google and TikTok payloads", () => {
    const meta = {
      object: "page",
      entry: [
        {
          changes: [
            { field: "leadgen", value: { leadgen_id: "L1", form_id: "F1", ad_id: "A1" } },
            { field: "feed", value: {} },
          ],
        },
      ],
    };
    expect(metaLeadgenEvents(meta)).toEqual([
      { leadgenId: "L1", formId: "F1", adId: "A1", fieldData: undefined },
    ]);
    expect(
      metaFields([
        { name: "email", values: ["a@b.example"] },
        { name: "x", values: [] },
      ]),
    ).toEqual({ email: "a@b.example" });

    expect(
      googleLead({
        lead_id: "G1",
        campaign_id: 99,
        gcl_id: "gclid-1",
        is_test: true,
        user_column_data: [
          { column_id: "FULL_NAME", string_value: "Lee Chan" },
          { column_id: "EMAIL", string_value: "lee@example.com" },
        ],
      }),
    ).toMatchObject({
      externalId: "google:G1",
      campaignId: "99",
      gclid: "gclid-1",
      isTest: true,
      fields: { FULL_NAME: "Lee Chan", EMAIL: "lee@example.com" },
    });
    expect(googleLead({})).toBeNull();

    expect(
      tiktokLeads({
        data: {
          leads: [
            {
              lead_id: "T1",
              campaign_name: "offplan-oct",
              fields: [{ name: "email", value: "t@example.com" }],
            },
            { lead_id: "T2", fields: { phone_number: "+971500000000" } },
          ],
        },
      }).map((l) => [l.externalId, l.fields, l.campaignName ?? null]),
    ).toEqual([
      ["tiktok:T1", { email: "t@example.com" }, "offplan-oct"],
      ["tiktok:T2", { phone_number: "+971500000000" }, null],
    ]);
  });

  it("campaign and ad ids become the touch", () => {
    const at = new Date("2026-10-01T00:00:00Z");
    expect(
      socialTouch(
        "meta",
        {
          externalId: "meta:1",
          fields: {},
          campaignName: "offplan-oct",
          adName: "Video 2",
          formId: "F1",
          platform: "ig",
        },
        at,
      ),
    ).toEqual({
      utm_source: "instagram",
      utm_medium: "paid_social",
      utm_campaign: "offplan-oct",
      utm_content: "Video 2",
      landing_path: "(lead form F1)",
      channel: "paid_social",
      at: at.toISOString(),
    });
    expect(
      socialTouch("google", { externalId: "google:1", fields: {}, gclid: "g" }, at),
    ).toMatchObject({
      utm_source: "google",
      channel: "paid_search",
      gclid: "g",
    });
  });
});
