import { describe, expect, it } from "vitest";
import { idTimestamp, isUuid, newId, randomToken } from "@/lib/ids";

describe("newId (UUID v7)", () => {
  it("produces RFC 9562 v7 UUIDs", () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7"); // version nibble
    expect(["8", "9", "a", "b"]).toContain(id[19]); // variant bits 10xx
  });

  it("encodes the timestamp in the first 48 bits", () => {
    const now = Date.UTC(2026, 9, 20, 12, 30, 45, 123);
    expect(idTimestamp(newId(now))).toBe(now);
  });

  it("sorts by creation time", () => {
    const a = newId(1_700_000_000_000);
    const b = newId(1_700_000_000_001);
    const c = newId(1_800_000_000_000);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId()));
    expect(ids.size).toBe(5000);
  });
});

describe("randomToken", () => {
  it("uses only unambiguous characters", () => {
    const t = randomToken(200);
    expect(t).toHaveLength(200);
    expect(t).not.toMatch(/[l10o]/);
  });
});
