import type { TaskStatus } from "./domain";

// ETAs are ISO calendar days ("2026-10-31") with no timezone attached, so every
// helper here works on the string parts rather than on a Date's local midnight.

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Today as a calendar day, in the viewer's own timezone. */
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar parts of an ISO day, or null for anything that is not one. */
function parts(iso: string) {
  if (!ISO_DAY.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** True for a well-formed ISO calendar day; the client-side twin of the server check. */
export function isIsoDay(value: string): boolean {
  return parts(value) !== null;
}

/** "Oct 31", or "Oct 31, 2027" once the year stops being the obvious one. */
export function formatDay(iso: string, relativeTo = todayIso()): string {
  const value = parts(iso);
  if (value === null) return iso;
  const sameYear = iso.slice(0, 4) === relativeTo.slice(0, 4);
  const base = `${MONTHS[value.month - 1]} ${value.day}`;
  return sameYear ? base : `${base}, ${value.year}`;
}

/**
 * A last-modified stamp, which is a *moment* rather than a calendar day —
 * "today, 14:32" beats "Aug 27" for an edit somebody is asking about, and the
 * day alone is enough once it stops being recent.
 */
export function formatStamp(at: number, relativeTo = todayIso()): string {
  const when = new Date(at);
  const day = [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(
    2,
    "0",
  )}`;
  if (day === relativeTo) return `today, ${time}`;
  if (day === addDays(relativeTo, -1)) return `yesterday, ${time}`;
  return formatDay(day, relativeTo);
}

/** "Oct 5 – Nov 1" for a promotion's date window. */
export function formatRange(start: string, end: string, relativeTo = todayIso()): string {
  return `${formatDay(start, relativeTo)} – ${formatDay(end, relativeTo)}`;
}

/** The calendar day `days` after `iso` (negative to go back). */
export function addDays(iso: string, days: number): string {
  const value = parts(iso);
  if (value === null) return iso;
  const shifted = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  if (a === null || b === null) return 0;
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

/**
 * Overdue is derived, never stored (CONTEXT.md: Overdue): past ETA and not yet
 * delivered. A task with no ETA can never be overdue.
 */
export function isOverdue(
  eta: string | undefined,
  status: TaskStatus,
  today: string,
): eta is string {
  return eta !== undefined && status !== "delivered" && eta < today;
}

/** "6 days late" / "due today" / "in 12 days" — the phrasing next to an ETA. */
export function dueLabel(eta: string, today: string): string {
  const days = daysBetween(today, eta);
  if (days === 0) return "due today";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
