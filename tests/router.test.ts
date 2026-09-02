import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { href, parse, placeRoute, type Route } from "../src/lib/router";

const season = "s1" as Id<"seasons">;
const plan = "p1" as Id<"chainPlans">;
const promotion = "m1" as Id<"promotions">;
const taskId = "t1" as Id<"tasks">;
const person = "h1" as Id<"people">;

const ROUTES: Route[] = [
  { name: "home" },
  { name: "home", seasonId: season },
  { name: "season", seasonId: season },
  { name: "season", seasonId: season, focusTaskId: taskId },
  { name: "plan", chainPlanId: plan },
  { name: "plan", chainPlanId: plan, focusTaskId: taskId },
  { name: "promotion", promotionId: promotion, focusTaskId: taskId },
  { name: "people" },
  { name: "people", personId: person },
  { name: "manage" },
];

describe("router", () => {
  test("every route survives a trip through its hash", () => {
    for (const route of ROUTES) {
      expect(parse(href(route))).toEqual(route);
    }
  });

  test("bare, empty and slash-only hashes are the dashboard", () => {
    expect(parse("")).toEqual({ name: "home" });
    expect(parse("#")).toEqual({ name: "home" });
    expect(parse("#/")).toEqual({ name: "home" });
  });

  test("an unknown path is not-found rather than a silent dashboard", () => {
    expect(parse("#/settings/advanced")).toEqual({ name: "notFound", path: "settings/advanced" });
  });

  test("placeRoute maps a resolved place to the page it is edited on", () => {
    expect(placeRoute({ tier: "promotion", promotionId: promotion }, taskId)).toEqual({
      name: "promotion",
      promotionId: promotion,
      focusTaskId: taskId,
    });
    expect(placeRoute({ tier: "season", seasonId: season })).toEqual({
      name: "season",
      seasonId: season,
      focusTaskId: undefined,
    });
  });
});
