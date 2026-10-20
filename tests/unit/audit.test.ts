import { describe, expect, it } from "vitest";
import { diffForAudit, redact } from "@/lib/audit";
import { truncateIp } from "@/lib/request";

describe("audit diff", () => {
  it("keeps only changed keys", () => {
    const d = diffForAudit(
      { title: "A", price: 100, status: "draft", updatedAt: new Date(1) },
      { title: "A", price: 90, status: "available", updatedAt: new Date(2) },
    );
    expect(d.changed).toBe(true);
    expect(d.before).toEqual({ price: 100, status: "draft" });
    expect(d.after).toEqual({ price: 90, status: "available" });
  });

  it("diffs nested objects one level deeper", () => {
    const d = diffForAudit(
      { colors: { accent: "#A9502F", bg: "#F7F3EE" }, fontBody: "Manrope" },
      { colors: { accent: "#B4402A", bg: "#F7F3EE" }, fontBody: "Manrope" },
    );
    expect(d.before).toEqual({ colors: { accent: "#A9502F" } });
    expect(d.after).toEqual({ colors: { accent: "#B4402A" } });
  });

  it("reports no change for equal values", () => {
    expect(diffForAudit({ a: [1, 2] }, { a: [1, 2] }).changed).toBe(false);
  });

  it("handles creates and deletes", () => {
    expect(diffForAudit(null, { a: 1 })).toEqual({ before: null, after: { a: 1 }, changed: true });
    expect(diffForAudit({ a: 1 }, null)).toEqual({ before: { a: 1 }, after: null, changed: true });
  });

  it("redacts secrets", () => {
    expect(redact({ name: "x", password: "p", nested: { apiKey: "k", ok: 1 } })).toEqual({
      name: "x",
      password: "[redacted]",
      nested: { apiKey: "[redacted]", ok: 1 },
    });
  });
});

describe("IP truncation", () => {
  it("truncates IPv4 to /24 and IPv6 to /48", () => {
    expect(truncateIp("203.0.113.77")).toBe("203.0.113.0");
    expect(truncateIp("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::");
    expect(truncateIp("::ffff:198.51.100.9")).toBe("198.51.100.0");
    expect(truncateIp("")).toBeNull();
    expect(truncateIp("garbage")).toBeNull();
  });
});
