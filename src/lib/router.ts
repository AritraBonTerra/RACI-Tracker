import { useMemo, useSyncExternalStore } from "react";
import type { Id } from "../../convex/_generated/dataModel";

// Hash routing, hand-rolled: a handful of views and no nested layouts do not
// justify a router dependency, and a hash keeps every view linkable on a static
// host.
//
// A tier route may carry a task to focus (`#/promotion/<id>/task/<taskId>`),
// which is how the dashboard's needs-attention rail lands you on the exact row
// rather than somewhere on the right page.
//
// The dashboard may name its plan year (`#/year/<id>`) so the sidebar's
// Dashboard link stays on the year you are looking at; bare `#/` means the
// newest year.

export type Route =
  | { name: "home"; seasonId?: Id<"seasons"> }
  | { name: "season"; seasonId: Id<"seasons">; focusTaskId?: Id<"tasks"> }
  | { name: "plan"; chainPlanId: Id<"chainPlans">; focusTaskId?: Id<"tasks"> }
  | { name: "promotion"; promotionId: Id<"promotions">; focusTaskId?: Id<"tasks"> }
  | { name: "people"; personId?: Id<"people"> }
  | { name: "manage" }
  | { name: "notFound"; path: string };

function withTask(base: string, focusTaskId: Id<"tasks"> | undefined) {
  return focusTaskId === undefined ? base : `${base}/task/${focusTaskId}`;
}

export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return route.seasonId === undefined ? "#/" : `#/year/${route.seasonId}`;
    case "season":
      return withTask(`#/season/${route.seasonId}`, route.focusTaskId);
    case "plan":
      return withTask(`#/plan/${route.chainPlanId}`, route.focusTaskId);
    case "promotion":
      return withTask(`#/promotion/${route.promotionId}`, route.focusTaskId);
    case "people":
      return route.personId === undefined ? "#/people" : `#/people/${route.personId}`;
    case "manage":
      return "#/manage";
    case "notFound":
      return `#/${route.path}`;
  }
}

export function parse(hash: string): Route {
  const [view, id, sub, subId] = hash.replace(/^#\/?/, "").split("/");
  // Ids only ever arrive as opaque strings from the URL bar; Convex rejects a
  // fabricated one at the query boundary, which surfaces as "no longer exists".
  const focusTaskId = sub === "task" && subId ? (subId as Id<"tasks">) : undefined;

  if (view === "season" && id) {
    return { name: "season", seasonId: id as Id<"seasons">, focusTaskId };
  }
  if (view === "plan" && id) {
    return { name: "plan", chainPlanId: id as Id<"chainPlans">, focusTaskId };
  }
  if (view === "promotion" && id) {
    return { name: "promotion", promotionId: id as Id<"promotions">, focusTaskId };
  }
  if (view === "people") {
    return { name: "people", personId: id ? (id as Id<"people">) : undefined };
  }
  if (view === "manage") return { name: "manage" };
  if (view === "year" && id) return { name: "home", seasonId: id as Id<"seasons"> };
  if (view === undefined || view === "") return { name: "home" };
  // A path nobody links to: say so, rather than quietly showing the dashboard.
  return { name: "notFound", path: hash.replace(/^#\/?/, "") };
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  // Parsed once per hash, so consumers get a stable object across renders.
  return useMemo(() => parse(hash), [hash]);
}

/**
 * Go somewhere. `replace` swaps the current history entry instead of pushing
 * one — for leaving a page that no longer exists, so Back does not return to it.
 */
export function navigate(route: Route, { replace = false } = {}) {
  if (replace) window.location.replace(href(route));
  else window.location.hash = href(route);
}

/** The page a task is edited on, from the place the backend resolved for it. */
export function placeRoute(
  place:
    | { tier: "season"; seasonId: Id<"seasons"> }
    | { tier: "chainPlan"; chainPlanId: Id<"chainPlans"> }
    | { tier: "promotion"; promotionId: Id<"promotions"> },
  focusTaskId?: Id<"tasks">,
): Route {
  switch (place.tier) {
    case "season":
      return { name: "season", seasonId: place.seasonId, focusTaskId };
    case "chainPlan":
      return { name: "plan", chainPlanId: place.chainPlanId, focusTaskId };
    case "promotion":
      return { name: "promotion", promotionId: place.promotionId, focusTaskId };
  }
}
