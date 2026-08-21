import type { Doc } from "../../convex/_generated/dataModel";

// Display vocabulary for the domain: the nine phases of the Integrated
// Commercial Cycle and the four task statuses. Kept in one place so the phase
// number, its title and its colour never drift between views.

export type PhaseNumber = Doc<"tasks">["phase"];
export type TaskStatus = Doc<"tasks">["status"];

type PhaseMeta = {
  title: string;
  summary: string;
};

export const PHASES: Record<PhaseNumber, PhaseMeta> = {
  0: {
    title: "Strategic foundation",
    summary: "Targets, portfolio priorities, brand calendar, trade budget.",
  },
  1: {
    title: "Internal alignment",
    summary: "Reason to exist, right to win, spend envelope, negotiation range.",
  },
  2: {
    title: "Distributor alignment",
    summary: "Joint plan, capability check, incentives, who leads the buyer meeting.",
  },
  3: {
    title: "JBP & negotiation",
    summary: "Business review, the offer, the ask — items, shelf, pricing, calendar.",
  },
  4: { title: "Agreement", summary: "Terms documented and booked; readiness confirmed." },
  5: {
    title: "Activation planning",
    summary: "Stores, mechanics, brand support, distributor execution.",
  },
  6: {
    title: "Retail execution",
    summary: "Sell-in, CWD, compliance, proof of execution.",
  },
  7: { title: "Tracking & measurement", summary: "Depletions, POS, $/store/wk, ROI." },
  8: { title: "Review", summary: "Worked / didn't / repeat next year." },
};

export const SEASON_PHASES = [0] as const satisfies readonly PhaseNumber[];
export const CHAIN_PLAN_PHASES = [1, 2, 3, 4] as const satisfies readonly PhaseNumber[];
export const PROMOTION_PHASES = [5, 6, 7, 8] as const satisfies readonly PhaseNumber[];
export const ALL_PHASES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly PhaseNumber[];

type StatusMeta = {
  label: string;
  /** Pill styling — the one place status colour is decided. */
  pill: string;
  /** The status dot on a checklist row. */
  dot: string;
  /** Left edge of the row, so a wall of rows reads as a column of colour. */
  edge: string;
};

export const STATUSES: Record<TaskStatus, StatusMeta> = {
  not_started: {
    label: "Not started",
    pill: "bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-700",
    dot: "border-2 border-ink-600",
    edge: "bg-ink-700",
  },
  in_progress: {
    label: "In progress",
    pill: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/40",
    dot: "border-2 border-sky-400 bg-sky-400/30",
    edge: "bg-sky-500",
  },
  blocked: {
    label: "Blocked",
    pill: "bg-rose-500/20 text-rose-200 ring-1 ring-inset ring-rose-500/60",
    dot: "border-2 border-rose-400 bg-rose-500",
    edge: "bg-rose-500",
  },
  delivered: {
    label: "Delivered",
    pill: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40",
    dot: "border-2 border-emerald-400 bg-emerald-400",
    edge: "bg-emerald-500",
  },
};

export const STATUS_ORDER = [
  "not_started",
  "in_progress",
  "blocked",
  "delivered",
] as const satisfies readonly TaskStatus[];

const ROLE_LETTER = {
  responsible: "R",
  accountable: "A",
  consulted: "C",
  informed: "I",
} as const;

/** "A/R" for the slide-16 matrix cell a phase header shows as guidance. */
export function roleLetters(roles: readonly (keyof typeof ROLE_LETTER)[]): string {
  return roles.map((role) => ROLE_LETTER[role]).join("/");
}

/** Coerces an unvalidated number (a URL fragment, a select value) to a phase. */
export function toPhase(value: number): PhaseNumber | null {
  const match = ALL_PHASES.find((candidate) => candidate === value);
  return match ?? null;
}
