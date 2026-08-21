import { useSyncExternalStore } from "react";
import type { Id } from "../../convex/_generated/dataModel";

// Hash routing, hand-rolled: five views and no nested layouts do not justify a
// router dependency, and a hash keeps every view linkable on a static host.

export type Route =
  | { name: "home" }
  | { name: "season"; seasonId: Id<"seasons"> }
  | { name: "plan"; chainPlanId: Id<"chainPlans"> }
  | { name: "promotion"; promotionId: Id<"promotions"> }
  | { name: "manage" };

export function href(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "season":
      return `#/season/${route.seasonId}`;
    case "plan":
      return `#/plan/${route.chainPlanId}`;
    case "promotion":
      return `#/promotion/${route.promotionId}`;
    case "manage":
      return "#/manage";
  }
}

function parse(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, "").split("/");
  // Ids only ever arrive as opaque strings from the URL bar; Convex rejects a
  // fabricated one at the query boundary, which surfaces as "no longer exists".
  if (view === "season" && id) return { name: "season", seasonId: id as Id<"seasons"> };
  if (view === "plan" && id) return { name: "plan", chainPlanId: id as Id<"chainPlans"> };
  if (view === "promotion" && id) {
    return { name: "promotion", promotionId: id as Id<"promotions"> };
  }
  if (view === "manage") return { name: "manage" };
  return { name: "home" };
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
  return parse(hash);
}

export function navigate(route: Route) {
  window.location.hash = href(route);
}
