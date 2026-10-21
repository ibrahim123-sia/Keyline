import { describe, expect, it } from "vitest";
import {
  composerMode,
  insideWindow,
  leadIdFromAddress,
  leadReplyAddress,
  parseAddress,
  templateParameters,
  waId,
  windowExpiry,
} from "@/features/inbox/rules";
import {
  verifyGoogleKey,
  verifyHubSignature,
  verifySvixSignature,
  verifyTiktokSignature,
} from "@/features/integrations/signatures";
import { bytesToBase64, hmacSha256Hex } from "@/lib/crypto";

const body = '{"object":"whatsapp_business_account","entry":[]}';

async function svixSign(secretBytes: Uint8Array, id: string, ts: string, raw: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes as Uint8Array<ArrayBuffer>,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  return bytesToBase64(new Uint8Array(mac));
}

describe("webhook signatures", () => {
  it("Meta: sha256=<hex> of the raw body with the app secret", async () => {
    const sig = `sha256=${await hmacSha256Hex("app-secret", body)}`;
    expect(await verifyHubSignature(body, sig, "app-secret")).toBe(true);
    expect(
      await verifyHubSignature(body, sig.toUpperCase().replace("SHA256", "sha256"), "app-secret"),
    ).toBe(true);
    expect(await verifyHubSignature(`${body} `, sig, "app-secret")).toBe(false);
    expect(await verifyHubSignature(body, sig, "other")).toBe(false);
    expect(await verifyHubSignature(body, "sha1=abc", "app-secret")).toBe(false);
    expect(await verifyHubSignature(body, null, "app-secret")).toBe(false);
    expect(await verifyHubSignature(body, sig, null)).toBe(false);
  });

  it("Svix (Resend): v1 signatures over id.timestamp.body, recent only", async () => {
    const keyBytes = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
    const secret = `whsec_${bytesToBase64(keyBytes)}`;
    const now = 1_760_000_000_000;
    const ts = String(now / 1000);
    const sig = await svixSign(keyBytes, "msg_1", ts, body);
    const headers = { id: "msg_1", timestamp: ts, signature: `v1,wrong v1,${sig}` };
    expect(await verifySvixSignature(body, headers, secret, now)).toBe(true);
    expect(await verifySvixSignature(body, { ...headers, id: "msg_2" }, secret, now)).toBe(false);
    // Replayed ten minutes later: refused.
    expect(await verifySvixSignature(body, headers, secret, now + 600_000)).toBe(false);
    expect(await verifySvixSignature(body, headers, "whsec_!!notbase64", now)).toBe(false);
    expect(await verifySvixSignature(body, { ...headers, signature: null }, secret, now)).toBe(
      false,
    );
  });

  it("TikTok: plain, prefixed or timestamped hex HMACs", async () => {
    const hex = await hmacSha256Hex("tt-secret", body);
    expect(await verifyTiktokSignature(body, hex, "tt-secret")).toBe(true);
    expect(await verifyTiktokSignature(body, `sha256=${hex}`, "tt-secret")).toBe(true);
    const now = 1_760_000_000_000;
    const stamped = await hmacSha256Hex("tt-secret", `1760000000.${body}`);
    expect(await verifyTiktokSignature(body, `t=1760000000,s=${stamped}`, "tt-secret", now)).toBe(
      true,
    );
    expect(
      await verifyTiktokSignature(body, `t=1760000000,s=${stamped}`, "tt-secret", now + 3_600_000),
    ).toBe(false);
    expect(await verifyTiktokSignature(body, "deadbeef", "tt-secret")).toBe(false);
  });

  it("Google Ads: the key in the body", () => {
    expect(verifyGoogleKey("k-123", "k-123")).toBe(true);
    expect(verifyGoogleKey("k-124", "k-123")).toBe(false);
    expect(verifyGoogleKey("", "")).toBe(false);
    expect(verifyGoogleKey(null, "k")).toBe(false);
  });
});

describe("inbox rules", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("the WhatsApp 24-hour window decides the composer mode", () => {
    const last = new Date("2026-10-20T13:00:00Z");
    expect(windowExpiry(last).toISOString()).toBe("2026-10-21T13:00:00.000Z");
    expect(insideWindow(windowExpiry(last), now)).toBe(true);
    expect(insideWindow(new Date("2026-10-21T11:59:59Z"), now)).toBe(false);
    expect(insideWindow(null, now)).toBe(false);
    expect(composerMode("whatsapp", windowExpiry(last), now)).toBe("text");
    expect(composerMode("whatsapp", "2026-10-21T11:00:00Z", now)).toBe("template");
    expect(composerMode("whatsapp", null, now)).toBe("template");
    expect(composerMode("email", null, now)).toBe("text");
    expect(composerMode("web_chat", null, now)).toBe("text");
  });

  it("template parameters follow the approved order; empty values become a dash", () => {
    expect(
      templateParameters(["name", "agent", "url"], {
        name: "Sam",
        agent: null,
        url: "https://x.example/a",
      }),
    ).toEqual(["Sam", "-", "https://x.example/a"]);
    // No new lines, tabs or runs of more than three spaces (WhatsApp refuses them).
    expect(templateParameters(["message"], { message: "Line one\nline two\t     end" })).toEqual([
      "Line one line two   end",
    ]);
  });

  it("lead reply addresses and email addresses", () => {
    const id = "0192f000-0000-7000-8000-0000000000aa";
    expect(leadReplyAddress(id, "@In.HavenDune.example ")).toBe(`lead+${id}@in.havendune.example`);
    expect(leadReplyAddress(id, "")).toBeNull();
    expect(leadIdFromAddress(`Lead+${id}@in.havendune.example`, "in.havendune.example")).toBe(id);
    expect(leadIdFromAddress(`lead+${id}@other.example`, "in.havendune.example")).toBeNull();
    expect(parseAddress('"Sam Visitor" <Sam@Example.com>')).toEqual({
      name: "Sam Visitor",
      email: "sam@example.com",
    });
    expect(parseAddress("sam@example.com")).toEqual({ name: null, email: "sam@example.com" });
    expect(parseAddress("not an address")).toBeNull();
    expect(waId("+971 50 123-4567")).toBe("971501234567");
  });
});
