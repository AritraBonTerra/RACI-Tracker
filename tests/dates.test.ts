import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  dueLabel,
  formatDay,
  formatRange,
  isIsoDay,
  isOverdue,
} from "../src/lib/dates";

describe("isIsoDay", () => {
  test("accepts a calendar day and rejects everything else", () => {
    expect(isIsoDay("2026-10-31")).toBe(true);
    expect(isIsoDay("2026-13-01")).toBe(false);
    expect(isIsoDay("2026-00-10")).toBe(false);
    expect(isIsoDay("2026-10-32")).toBe(false);
    expect(isIsoDay("2026-1-5")).toBe(false);
    expect(isIsoDay("Oct 31")).toBe(false);
    expect(isIsoDay("")).toBe(false);
  });
});

describe("formatDay", () => {
  test("drops the year when it matches the reference day", () => {
    expect(formatDay("2026-10-31", "2026-01-01")).toBe("Oct 31");
    expect(formatDay("2027-01-05", "2026-12-31")).toBe("Jan 5, 2027");
  });

  test("echoes malformed input instead of printing undefined", () => {
    expect(formatDay("2026-13-45", "2026-01-01")).toBe("2026-13-45");
    expect(formatDay("soon", "2026-01-01")).toBe("soon");
  });

  test("formatRange threads the reference day through both ends", () => {
    expect(formatRange("2026-10-05", "2026-11-01", "2026-06-01")).toBe("Oct 5 – Nov 1");
    expect(formatRange("2026-12-20", "2027-01-10", "2026-06-01")).toBe("Dec 20 – Jan 10, 2027");
  });
});

describe("addDays / daysBetween", () => {
  test("crosses month and year boundaries on the calendar, not local time", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  test("daysBetween is signed and whole", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("nope", "2026-01-01")).toBe(0);
  });
});

describe("isOverdue", () => {
  test("needs an ETA in the past and an undelivered status", () => {
    expect(isOverdue("2026-01-01", "in_progress", "2026-01-02")).toBe(true);
    expect(isOverdue("2026-01-01", "blocked", "2026-01-02")).toBe(true);
    expect(isOverdue("2026-01-01", "delivered", "2026-01-02")).toBe(false);
    expect(isOverdue("2026-01-02", "in_progress", "2026-01-02")).toBe(false);
    expect(isOverdue(undefined, "not_started", "2026-01-02")).toBe(false);
  });
});

describe("dueLabel", () => {
  test("phrases the distance to the ETA", () => {
    expect(dueLabel("2026-01-02", "2026-01-02")).toBe("due today");
    expect(dueLabel("2026-01-01", "2026-01-02")).toBe("1 day late");
    expect(dueLabel("2025-12-30", "2026-01-02")).toBe("3 days late");
    expect(dueLabel("2026-01-03", "2026-01-02")).toBe("in 1 day");
    expect(dueLabel("2026-01-14", "2026-01-02")).toBe("in 12 days");
  });
});
