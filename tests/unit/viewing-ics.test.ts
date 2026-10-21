import { describe, expect, it } from "vitest";
import { viewingIcs } from "@/features/viewings/ics";

const base = {
  uid: "0192f000-0000-7000-8000-00000000abcd@havendune.example",
  start: new Date("2026-10-26T08:00:00Z"),
  end: new Date("2026-10-26T08:30:00Z"),
  summary: "Viewing: HD-2041, Two bed; marina view",
  now: new Date("2026-10-22T10:15:30.123Z"),
};

describe("viewing invite (.ics)", () => {
  it("one event in UTC with escaped text and CRLF lines", () => {
    const ics = viewingIcs({
      ...base,
      description: "Line one\nLine two",
      url: "https://x.example/v/1",
    });
    const lines = ics.split("\r\n");
    expect(lines).toContain("DTSTART:20261026T080000Z");
    expect(lines).toContain("DTEND:20261026T083000Z");
    expect(lines).toContain("DTSTAMP:20261022T101530Z");
    expect(lines).toContain("SUMMARY:Viewing: HD-2041\\, Two bed\\; marina view");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds long lines at 75 octets and marks cancellations", () => {
    const ics = viewingIcs({ ...base, description: "é".repeat(80), cancelled: true, sequence: 2 });
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain("\r\n ");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:2");
    // Unfolding gives the text back.
    expect(ics.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"é".repeat(80)}`);
  });
});
