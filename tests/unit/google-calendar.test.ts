import { describe, expect, it } from "vitest";
import { busyInterval, viewingEvent } from "@/features/integrations/google-calendar/calendar";

describe("Google Calendar mapping", () => {
  it("a viewing becomes an event that says what, who and how", () => {
    const e = viewingEvent({
      id: "v1",
      type: "video",
      startsAt: new Date("2026-10-26T08:00:00Z"),
      endsAt: new Date("2026-10-26T08:30:00Z"),
      notes: "Parking?",
      meetingUrl: "https://zoom.example/j/1",
      what: "HD-2041 · Two bed",
      contactName: "Sam Visitor",
      contactPhone: "+971501234567",
      contactEmail: null,
      leadUrl: "https://agency.example/admin/leads/l1",
    });
    expect(e).toEqual({
      summary: "Viewing: HD-2041 · Two bed · Sam Visitor",
      description:
        "Video tour\nhttps://zoom.example/j/1\nSam Visitor · +971501234567\nParking?\nLead: https://agency.example/admin/leads/l1",
      start: new Date("2026-10-26T08:00:00Z"),
      end: new Date("2026-10-26T08:30:00Z"),
      viewingId: "v1",
    });
  });

  it("all-day events block whole days in the agency's time zone", () => {
    expect(
      busyInterval({ allDay: true, startDate: "2026-10-27", endDate: "2026-10-28" }, "Asia/Dubai"),
    ).toEqual({
      start: new Date("2026-10-26T20:00:00Z"),
      end: new Date("2026-10-27T20:00:00Z"),
    });
    const timed = {
      start: new Date("2026-10-26T08:00:00Z"),
      end: new Date("2026-10-26T09:00:00Z"),
    };
    expect(busyInterval(timed, "Asia/Dubai")).toBe(timed);
  });
});
