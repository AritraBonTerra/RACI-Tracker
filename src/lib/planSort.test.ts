import { expect, test } from "vitest";
import { type SortablePlan, sortPlans } from "./planSort";

const plan = (
  name: string,
  rollup: Partial<NonNullable<SortablePlan["rollup"]>> | null = {},
  jbpDate?: string,
): SortablePlan => ({
  name,
  rollup:
    rollup === null
      ? null
      : { unassigned: 0, blocked: 0, overdue: 0, delivered: 0, total: 0, ...rollup },
  jbpDate,
});

const names = (plans: readonly SortablePlan[]) => plans.map((p) => p.name);
const same = (p: SortablePlan) => p;

test("name is A to Z regardless of health", () => {
  const plans = [plan("Kroger", { unassigned: 9 }), plan("Aldi"), plan("Costco", null)];
  expect(names(sortPlans(plans, "name", same))).toEqual(["Aldi", "Costco", "Kroger"]);
});

test("health sorts put the most troubled first and break ties by name", () => {
  const plans = [
    plan("Safeway", { unassigned: 2 }),
    plan("Aldi", { unassigned: 0 }),
    plan("Kroger", { unassigned: 2 }),
    plan("HEB", { unassigned: 5 }),
  ];
  expect(names(sortPlans(plans, "unassigned", same))).toEqual(["HEB", "Kroger", "Safeway", "Aldi"]);
});

test("a plan reached only as context sorts last on a health sort", () => {
  const plans = [plan("Aldi", null), plan("Kroger", { blocked: 0 }), plan("HEB", { blocked: 1 })];
  expect(names(sortPlans(plans, "blocked", same))).toEqual(["HEB", "Kroger", "Aldi"]);
});

test("JBP date is soonest first with unscheduled plans at the end", () => {
  const plans = [
    plan("Kroger", {}, "2026-11-02"),
    plan("Aldi"),
    plan("HEB", {}, "2026-03-15"),
    plan("Costco", {}, "2026-11-02"),
  ];
  expect(names(sortPlans(plans, "jbp", same))).toEqual(["HEB", "Costco", "Kroger", "Aldi"]);
});

test("least progress is the lowest delivered share, with empty checklists last", () => {
  const plans = [
    plan("Aldi", { delivered: 8, total: 8 }),
    plan("Kroger", { delivered: 1, total: 4 }),
    plan("HEB", { delivered: 0, total: 0 }),
    plan("Costco", { delivered: 2, total: 4 }),
  ];
  expect(names(sortPlans(plans, "progress", same))).toEqual(["Kroger", "Costco", "Aldi", "HEB"]);
});

test("the input list is left untouched", () => {
  const plans = [plan("Kroger"), plan("Aldi")];
  sortPlans(plans, "name", same);
  expect(names(plans)).toEqual(["Kroger", "Aldi"]);
});

test("a JBP date that does not parse sorts with the unscheduled plans", () => {
  const plans = [plan("Kroger", {}, "not-a-date"), plan("Aldi"), plan("HEB", {}, "2026-03-15")];
  expect(names(sortPlans(plans, "jbp", same))).toEqual(["HEB", "Aldi", "Kroger"]);
});
