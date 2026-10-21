import { describe, expect, it } from "vitest";
import {
  freeSlots,
  isFreeSlot,
  zonedDate,
  zonedTime,
  type SlotRules,
} from "@/features/viewings/slots";

const dubai: SlotRules = {
  timeZone: "Asia/Dubai",
  workingHours: { wed: [["09:00", "12:00"]], thu: [["10:00", "11:00"]] },
  lengthMin: 30,
  bufferMin: 15,
  minNoticeHours: 4,
  bookingWindowDays: 1,
  holidays: [],
  overrides: [],
};
// Wednesday 21 October 2026, 04:00 in Dubai.
const now = new Date("2026-10-21T00:00:00Z");
const local = (slots: Array<{ start: Date }>, tz = "Asia/Dubai") =>
  slots.map((s) =>
    s.start.toLocaleString("en-GB", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );

describe("viewing slots (09 §5)", () => {
  it("working hours in the agency's time zone, after the minimum notice", () => {
    // 4 hours' notice from 04:00: the first slot is 08:00 at the earliest, so 09:00.
    expect(local(freeSlots(dubai, [], now))).toEqual([
      "Wed 09:00",
      "Wed 09:30",
      "Wed 10:00",
      "Wed 10:30",
      "Wed 11:00",
      "Wed 11:30",
      "Thu 10:00",
      "Thu 10:30",
    ]);
    // Late in the morning only what is still 4 hours away is left.
    expect(local(freeSlots(dubai, [], new Date("2026-10-21T03:20:00Z")))).toEqual([
      "Wed 11:30",
      "Thu 10:00",
      "Thu 10:30",
    ]);
  });

  it("existing viewings and calendar busy times block their slot and the buffer around it", () => {
    // A viewing 10:00-10:30 Dubai (06:00-06:30 UTC) with 15 minutes either side.
    const busy = [
      { start: new Date("2026-10-21T06:00:00Z"), end: new Date("2026-10-21T06:30:00Z") },
    ];
    expect(local(freeSlots(dubai, busy, now)).filter((s) => s.startsWith("Wed"))).toEqual([
      "Wed 09:00",
      "Wed 11:00",
      "Wed 11:30",
    ]);
    expect(isFreeSlot(dubai, busy, now, new Date("2026-10-21T05:30:00Z"))).toBe(false);
    expect(isFreeSlot(dubai, busy, now, new Date("2026-10-21T07:00:00Z"))).toBe(true);
  });

  it("holidays, days off and other hours for one day", () => {
    expect(local(freeSlots({ ...dubai, holidays: ["2026-10-21"] }, [], now))).toEqual([
      "Thu 10:00",
      "Thu 10:30",
    ]);
    expect(
      local(
        freeSlots(
          {
            ...dubai,
            overrides: [
              { date: "2026-10-21", blocked: false, hours: [{ from: "15:00", to: "16:00" }] },
              { date: "2026-10-22", blocked: true },
            ],
          },
          [],
          now,
        ),
      ),
    ).toEqual(["Wed 15:00", "Wed 15:30"]);
  });

  it("daylight saving: London on the Sunday the clocks go back", () => {
    const london: SlotRules = {
      ...dubai,
      timeZone: "Europe/London",
      workingHours: { sat: [["09:00", "10:00"]], sun: [["09:00", "10:00"]] },
      minNoticeHours: 0,
      bookingWindowDays: 2,
    };
    const slots = freeSlots(london, [], new Date("2026-10-24T00:00:00Z"));
    // 09:00 on Saturday is BST (08:00 UTC); on Sunday it is GMT (09:00 UTC).
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      "2026-10-24T08:00:00.000Z",
      "2026-10-24T08:30:00.000Z",
      "2026-10-25T09:00:00.000Z",
      "2026-10-25T09:30:00.000Z",
    ]);
    expect(local(slots, "Europe/London")).toEqual([
      "Sat 09:00",
      "Sat 09:30",
      "Sun 09:00",
      "Sun 09:30",
    ]);
  });

  it("time zone helpers", () => {
    expect(zonedTime("2026-10-21", 9 * 60, "Asia/Dubai").toISOString()).toBe(
      "2026-10-21T05:00:00.000Z",
    );
    // A time skipped when clocks go forward moves on with them (London, 29 March 2026).
    expect(zonedTime("2026-03-29", 90, "Europe/London").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(zonedDate(new Date("2026-10-21T21:30:00Z"), "Asia/Dubai")).toBe("2026-10-22");
  });
});
