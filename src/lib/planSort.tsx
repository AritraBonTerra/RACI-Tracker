import { useSyncExternalStore } from "react";
import { selectClass } from "../components/ui";

// One ordering for the chain plans, wherever they are listed: the sidebar, the
// Plan Year page and the dashboard all sort by the same saved choice, so a list
// never disagrees with the one beside it. Name is the default because it is the
// order people already carry in their heads; the health sorts exist so a wall
// of fifty accounts can put the troubled ones first.

/** What a chain plan offers to be sorted by, whichever query it came from. */
export type SortablePlan = {
  name: string;
  /**
   * Null for a plan reached only as context: its counts are content the viewer
   * does not hold, so it sorts after every plan that has them.
   */
  rollup: {
    unassigned: number;
    blocked: number;
    overdue: number;
    delivered: number;
    total: number;
  } | null;
  jbpDate: string | undefined;
};

type SortSpec = {
  label: string;
  hint: string;
  /** The number a plan sorts by, or null to send it behind the plans that have one. */
  metric: (plan: SortablePlan) => number | null;
  direction: "asc" | "desc";
};

export const PLAN_SORTS = {
  name: {
    label: "Name",
    hint: "A to Z",
    metric: () => null,
    direction: "asc",
  },
  unassigned: {
    label: "Unassigned",
    hint: "Most unassigned tasks first",
    metric: (plan) => plan.rollup?.unassigned ?? null,
    direction: "desc",
  },
  blocked: {
    label: "Blocked",
    hint: "Most blocked tasks first",
    metric: (plan) => plan.rollup?.blocked ?? null,
    direction: "desc",
  },
  overdue: {
    label: "Overdue",
    hint: "Most overdue tasks first",
    metric: (plan) => plan.rollup?.overdue ?? null,
    direction: "desc",
  },
  jbp: {
    label: "JBP date",
    hint: "Soonest JBP first, unscheduled last",
    // An epoch keeps the comparison numeric. The field is free text on the
    // server, so a date that does not parse counts as unscheduled rather than
    // as NaN, which would compare equal to everything and float anywhere.
    metric: (plan) => {
      if (plan.jbpDate === undefined) return null;
      const epoch = Date.parse(plan.jbpDate);
      return Number.isFinite(epoch) ? epoch : null;
    },
    direction: "asc",
  },
  progress: {
    label: "Least progress",
    hint: "Lowest share delivered first",
    metric: (plan) =>
      plan.rollup === null || plan.rollup.total === 0
        ? null
        : plan.rollup.delivered / plan.rollup.total,
    direction: "asc",
  },
} as const satisfies Record<string, SortSpec>;

export type PlanSortKey = keyof typeof PLAN_SORTS;

export const DEFAULT_PLAN_SORT: PlanSortKey = "name";

export function isPlanSortKey(value: string): value is PlanSortKey {
  return Object.hasOwn(PLAN_SORTS, value);
}

/**
 * Sorts any list of chain-plan-shaped things by the chosen key. Ties, and the
 * name sort itself, fall through to the name, so the order is total and stable
 * across re-renders. `of` adapts each surface's own node type.
 */
export function sortPlans<T>(
  items: readonly T[],
  key: PlanSortKey,
  of: (item: T) => SortablePlan,
): T[] {
  const spec: SortSpec = PLAN_SORTS[key];
  const sign = spec.direction === "asc" ? 1 : -1;
  return items
    .map((item) => {
      const plan = of(item);
      return { item, metric: spec.metric(plan), name: plan.name };
    })
    .sort((a, b) => {
      if (a.metric !== b.metric) {
        if (a.metric === null) return 1;
        if (b.metric === null) return -1;
        return sign * (a.metric - b.metric);
      }
      return a.name.localeCompare(b.name);
    })
    .map((entry) => entry.item);
}

// --- The saved choice -----------------------------------------------------
//
// A tiny external store rather than context, because the sidebar and the page
// beside it are separate trees and both have to move when either one changes
// the sort.

const STORAGE_KEY = "raci.chainPlans.sort";
const listeners = new Set<() => void>();

function saved(): PlanSortKey {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw !== null && isPlanSortKey(raw) ? raw : DEFAULT_PLAN_SORT;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPlanSort(key: PlanSortKey) {
  localStorage.setItem(STORAGE_KEY, key);
  for (const listener of listeners) listener();
}

export function usePlanSort(): PlanSortKey {
  return useSyncExternalStore(subscribe, saved, () => DEFAULT_PLAN_SORT);
}

/** The control: a select in the chrome-bar style, or a smaller one for the sidebar. */
export function PlanSortSelect({ compact = false }: { compact?: boolean }) {
  const key = usePlanSort();
  return (
    <select
      aria-label="Sort chain plans"
      title={PLAN_SORTS[key].hint}
      value={key}
      onChange={(event) => {
        const { value } = event.target;
        if (isPlanSortKey(value)) setPlanSort(value);
      }}
      className={
        compact
          ? "h-5 max-w-24 cursor-pointer truncate rounded border border-transparent bg-transparent pr-0.5 text-2xs font-semibold text-ink-500 normal-case transition hover:border-ink-700 hover:text-ink-200 focus:border-accent focus:outline-none"
          : selectClass
      }
    >
      {Object.entries(PLAN_SORTS).map(([value, spec]) => (
        <option key={value} value={value}>
          {compact ? spec.label : `Sort: ${spec.label}`}
        </option>
      ))}
    </select>
  );
}
