import type { Doc } from "../../convex/_generated/dataModel";
import { addDays, daysBetween, isOverdue } from "./dates";
import { PHASES, type PhaseNumber } from "./domain";

// The Pathway (CONTEXT.md): the derived model behind the strip at the top of
// the Plan Year, Chain Plan and Promotion views. Everything here is computed
// from tasks and dates that already exist — nothing is stored.

type Task = Doc<"tasks">;

/**
 * Phase window anchors (CONTEXT.md: Phase window): the dates the domain already
 * knows. A promotion's in-market window pins phases 5–8; a chain plan's JBP
 * date pins phases 3–4. Task ETAs then widen the window, never shrink it.
 */
export type PhaseAnchors = Partial<
  Record<PhaseNumber, { start?: string; end?: string }>
>;

export function promotionAnchors(promotion: {
  startDate: string;
  endDate: string;
}): PhaseAnchors {
  return {
    5: { end: promotion.startDate },
    6: { start: promotion.startDate, end: promotion.endDate },
    7: { start: promotion.endDate },
    8: { start: promotion.endDate },
  };
}

export function chainPlanAnchors(plan: { jbpDate?: string }): PhaseAnchors {
  if (plan.jbpDate === undefined) return {};
  return { 3: { end: plan.jbpDate }, 4: { start: plan.jbpDate } };
}

export type PathwayPhase = {
  phase: PhaseNumber;
  title: string;
  current: boolean;
  counts: {
    total: number;
    delivered: number;
    inProgress: number;
    blocked: number;
    overdue: number;
    /** Days late of the most overdue task. */
    worstLate: number;
    overdueNames: string[];
  };
  /**
   * Null means unscheduled: no anchor and no ETAs, shown as such rather than
   * guessed. `inferred` marks a bound the data could not name (filled in as
   * two weeks from the known one) — an inferred end never turns a phase red.
   */
  window: { start: string; end: string; inferred: boolean } | null;
  state: "done" | "red" | "amber" | "ok";
};

function countsOf(tasks: readonly Task[], today: string): PathwayPhase["counts"] {
  const counts = {
    total: tasks.length,
    delivered: 0,
    inProgress: 0,
    blocked: 0,
    overdue: 0,
    worstLate: 0,
    overdueNames: [] as string[],
  };
  for (const task of tasks) {
    if (task.status === "delivered") counts.delivered += 1;
    else if (task.status === "in_progress") counts.inProgress += 1;
    else if (task.status === "blocked") counts.blocked += 1;
    if (isOverdue(task.eta, task.status, today)) {
      counts.overdue += 1;
      counts.overdueNames.push(task.name);
      counts.worstLate = Math.max(counts.worstLate, daysBetween(task.eta, today));
    }
  }
  return counts;
}

function windowOf(
  tasks: readonly Task[],
  anchor: { start?: string; end?: string } | undefined,
): PathwayPhase["window"] {
  // ISO days sort lexicographically, so min/max are plain string compares.
  const etas = tasks.flatMap((task) => (task.eta === undefined ? [] : [task.eta]));
  const etaMin = etas.length > 0 ? etas.reduce((a, b) => (a < b ? a : b)) : undefined;
  const etaMax = etas.length > 0 ? etas.reduce((a, b) => (a > b ? a : b)) : undefined;

  const min = (a?: string, b?: string) =>
    a === undefined ? b : b === undefined ? a : a < b ? a : b;
  const max = (a?: string, b?: string) =>
    a === undefined ? b : b === undefined ? a : a > b ? a : b;

  const start = min(anchor?.start, etaMin);
  const end = max(anchor?.end, etaMax);
  if (start !== undefined && end !== undefined) return { start, end, inferred: false };
  if (start !== undefined) return { start, end: addDays(start, 14), inferred: true };
  if (end !== undefined) return { start: addDays(end, -14), end, inferred: true };
  return null;
}

/**
 * The red/amber rule (CONTEXT.md: Pathway). Red = overdue or blocked work, or
 * a real (non-inferred) window that has passed with work remaining. Amber =
 * the window ends within a week and the phase isn't done. Color only — the
 * numbers underneath never change.
 */
function stateOf(
  counts: PathwayPhase["counts"],
  window: PathwayPhase["window"],
  today: string,
): PathwayPhase["state"] {
  const done = counts.total > 0 && counts.delivered === counts.total;
  if (done) return "done";
  if (counts.overdue > 0 || counts.blocked > 0) return "red";
  if (counts.total === 0 || window === null) return "ok";
  if (!window.inferred && window.end < today) return "red";
  const daysLeft = daysBetween(today, window.end);
  if (daysLeft >= 0 && daysLeft <= 7) return "amber";
  return "ok";
}

export function buildPathway(
  phases: readonly PhaseNumber[],
  tasks: readonly Task[],
  anchors: PhaseAnchors,
  currentPhase: PhaseNumber,
  today: string,
): PathwayPhase[] {
  return phases.map((phase) => {
    const own = tasks.filter((task) => task.phase === phase);
    const counts = countsOf(own, today);
    const window = windowOf(own, anchors[phase]);
    return {
      phase,
      title: PHASES[phase].title,
      current: phase === currentPhase,
      counts,
      window,
      state: stateOf(counts, window, today),
    };
  });
}

export type PathwayHeadline = { tone: "red" | "amber" | "ok"; text: string };

/**
 * The one call to action: the single most urgent finding across the strip.
 * Emmanuel's trigger — "retail execution is 5 days away and we're still at 50%
 * of planning" — outranks everything except work that is already late.
 */
export function pathwayHeadline(
  phases: readonly PathwayPhase[],
  today: string,
): PathwayHeadline {
  let best: (PathwayHeadline & { score: number }) | null = null;
  const offer = (score: number, tone: PathwayHeadline["tone"], text: string) => {
    if (best === null || score > best.score) best = { score, tone, text };
  };

  phases.forEach((phase, index) => {
    const { counts, window } = phase;
    const pct =
      counts.total === 0 ? 100 : Math.round((100 * counts.delivered) / counts.total);

    if (counts.overdue > 0)
      offer(
        300 + counts.overdue * 10 + counts.worstLate,
        "red",
        `${phase.title} has ${counts.overdue} overdue task${counts.overdue === 1 ? "" : "s"} — worst is ${counts.worstLate} day${counts.worstLate === 1 ? "" : "s"} late.`,
      );
    if (counts.blocked > 0)
      offer(
        290,
        "red",
        `${counts.blocked} blocked task${counts.blocked === 1 ? "" : "s"} in ${phase.title}.`,
      );
    if (phase.state === "red" && counts.overdue === 0 && counts.blocked === 0 && window)
      offer(
        250,
        "red",
        `${phase.title} window ended ${window.end} and it is at ${pct}%.`,
      );

    const next = phases[index + 1];
    if (next?.window && counts.total > 0 && pct < 100) {
      const inDays = daysBetween(today, next.window.start);
      if (inDays <= 0)
        offer(
          280,
          "red",
          `${next.title} already started — ${phase.title} is only at ${pct}%.`,
        );
      else if (inDays <= 14)
        offer(
          200 + (14 - inDays) * 5,
          "amber",
          `${next.title} starts in ${inDays} day${inDays === 1 ? "" : "s"} — ${phase.title} is at ${pct}%.`,
        );
    }

    if (phase.state === "amber" && window)
      offer(
        100,
        "amber",
        `${phase.title} is due in ${daysBetween(today, window.end)} day${daysBetween(today, window.end) === 1 ? "" : "s"} and is at ${pct}%.`,
      );
  });

  return best ?? { tone: "ok", text: "All phases on track." };
}
