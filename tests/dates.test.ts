import { describe, expect, it } from "vitest";
import { addDays, dayName, iso, mondayOf, prettyDate } from "@/lib/dates";

/**
 * The regression test for the bug that shipped: dates were formatted in UTC,
 * so from 7pm in Dallas the app rolled over and showed tomorrow's session
 * while the lifter was still doing today's.
 */
describe("iso — formats in the lifter's timezone, not the server's", () => {
  it("still reads as today at 8pm local, when UTC has already rolled over", () => {
    const lateEvening = new Date("2026-08-27T01:30:00Z"); // 20:30 on the 26th
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-08-27");
    expect(iso(lateEvening)).toBe("2026-08-26");
  });

  it("agrees with UTC during the working day", () => {
    expect(iso(new Date("2026-08-26T14:00:00Z"))).toBe("2026-08-26");
  });

  it("always returns YYYY-MM-DD", () => {
    expect(iso(new Date("2026-01-05T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("date helpers", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(iso(addDays(new Date("2026-12-31T12:00:00Z"), 1))).toBe("2027-01-01");
    expect(iso(addDays(new Date("2026-03-01T12:00:00Z"), -1))).toBe("2026-02-28");
  });

  it("mondayOf treats Sunday as the end of the week, not the start", () => {
    expect(iso(mondayOf(new Date("2026-08-30T12:00:00Z")))).toBe("2026-08-24");
    expect(iso(mondayOf(new Date("2026-08-24T12:00:00Z")))).toBe("2026-08-24");
  });

  it("derives the weekday from the date rather than trusting a label", () => {
    expect(dayName("2026-08-24")).toBe("Monday");
    expect(dayName("2026-08-30")).toBe("Sunday");
  });

  it("formats a readable date", () => {
    expect(prettyDate("2026-08-24")).toBe("August 24");
  });
});
