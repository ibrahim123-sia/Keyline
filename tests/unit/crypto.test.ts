import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptSecret,
  encryptSecret,
  hmacSha256Hex,
  maskSecret,
  sha256Hex,
  timingSafeEqual,
} from "@/lib/crypto";

describe("secret encryption", () => {
  it("round-trips and uses a fresh IV every time", async () => {
    const a = await encryptSecret("sk_live_123456789");
    const b = await encryptSecret("sk_live_123456789");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(await decryptSecret(a)).toBe("sk_live_123456789");
    expect(await decryptSecret(b)).toBe("sk_live_123456789");
  });

  it("rejects tampered ciphertext", async () => {
    const token = await encryptSecret("hello");
    const [v, iv, ct] = token.split(".");
    const bytes = base64UrlToBytes(ct!);
    bytes[0] = bytes[0]! ^ 0xff;
    await expect(decryptSecret(`${v}.${iv}.${bytesToBase64Url(bytes)}`)).rejects.toThrow();
  });

  it("masks all but the last four characters", () => {
    expect(maskSecret("abcdefghijkl")).toBe("••••••••ijkl");
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("")).toBe("");
  });
});

describe("hashing", () => {
  it("computes SHA-256 and HMAC-SHA256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // RFC 4231 test case 2
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("compares in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
