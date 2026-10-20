import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTag } from "next/cache";
import { saveSettingsGroup } from "@/features/settings/actions";
import { loadSettings } from "@/features/settings/queries";
import { defaultsFor } from "@/features/settings/schema";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

describe("saving a settings tab", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    adminState.signedInAt = undefined;
    await truncate("settings", "audit_log");
    vi.mocked(updateTag).mockClear();
  });

  it("saves the whole group and refreshes its cache tag", async () => {
    const value = { ...defaultsFor("general"), agencyName: "Haven & Dune", timeZone: "Asia/Dubai" };
    const res = await saveSettingsGroup({ group: "general", value });
    expect(res).toMatchObject({ ok: true, data: { agencyName: "Haven & Dune" } });
    expect((await loadSettings("general")).timeZone).toBe("Asia/Dubai");
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith("settings:general");
  });

  it("puts errors on the right field, including nested and list fields", async () => {
    const market = defaultsFor("market");
    const res = await saveSettingsGroup({
      group: "market",
      value: {
        ...market,
        baseCurrency: { ...market.baseCurrency, code: "us" },
        visitorCurrencies: [
          {
            code: "EUR",
            symbol: "€",
            symbolPosition: "before",
            decimals: 2,
            rate: -1,
            isExample: false,
          },
        ],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("VALIDATION");
      expect(res.fieldErrors?.["baseCurrency.code"]?.[0]).toContain("three-letter");
      expect(res.fieldErrors?.["visitorCurrencies.0.rate"]).toBeTruthy();
    }
    const tz = await saveSettingsGroup({
      group: "general",
      value: { ...defaultsFor("general"), timeZone: "Mars/Olympus" },
    });
    expect(tz.ok === false && tz.fieldErrors?.timeZone?.[0]).toContain("time zone");
  });

  it("refuses unknown keys, unsafe links and badly formatted WhatsApp numbers", async () => {
    const extra = await saveSettingsGroup({
      group: "seo",
      value: { ...defaultsFor("seo"), sneaky: true } as never,
    });
    expect(extra).toMatchObject({ ok: false, code: "VALIDATION" });

    const contact = defaultsFor("contact");
    const res = await saveSettingsGroup({
      group: "contact",
      value: {
        ...contact,
        whatsapp: "050 123 4567",
        socials: { ...contact.socials, instagram: "javascript:alert(1)" },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.whatsapp).toBeTruthy();
      expect(res.fieldErrors?.["socials.instagram"]).toBeTruthy();
    }
    const ok = await saveSettingsGroup({
      group: "contact",
      value: { ...contact, whatsapp: "+971 50 123 4567" },
    });
    expect(ok).toMatchObject({ ok: true, data: { whatsapp: "+971501234567" } });
  });

  it("security and integrations need a recent sign-in", async () => {
    adminState.signedInAt = new Date(Date.now() - 60 * 60 * 1000);
    const res = await saveSettingsGroup({
      group: "security",
      value: { ...defaultsFor("security"), require2fa: false },
    });
    expect(res).toMatchObject({ ok: false, code: "REAUTH_REQUIRED" });
    expect((await loadSettings("security")).require2fa).toBe(true);

    // Other tabs do not.
    const general = await saveSettingsGroup({ group: "general", value: defaultsFor("general") });
    expect(general.ok).toBe(true);
  });

  it("the read-only demo viewer cannot save", async () => {
    adminState.user = { ...testAdmin, readOnly: true };
    const res = await saveSettingsGroup({ group: "general", value: defaultsFor("general") });
    expect(res).toMatchObject({ ok: false, code: "READ_ONLY" });
  });
});
