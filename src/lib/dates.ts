// ETAs are ISO calendar days ("2026-10-31") with no timezone attached, so every
// helper here works on the string parts rather than on a Date's local midnight.

const MONTHS = [
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

function parts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/** "Oct 31", or "Oct 31, 2027" once the year stops being the obvious one. */
export function formatDay(iso: string, relativeTo = todayIso()): string {
  const value = parts(iso);
  if (value === null) return iso;
  const sameYear = iso.slice(0, 4) === relativeTo.slice(0, 4);
  const base = `${MONTHS[value.month - 1]} ${value.day}`;
  return sameYear ? base : `${base}, ${value.year}`;
}

/** "Oct 5 – Nov 1" for a promotion's date window. */
export function formatRange(start: string, end: string): string {
  return `${formatDay(start)} – ${formatDay(end)}`;
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
  status: string,
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
