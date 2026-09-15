import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { ADMIN, TODAY, world } from "../../convex/world.fixture";
import type { PeopleDirectory } from "../lib/people";
import { ChainPlanView } from "../views/ChainPlanView";
import { PromotionView } from "../views/PromotionView";
import { SeasonView } from "../views/SeasonView";

const state = vi.hoisted(() => ({
  canEdit: false,
  responses: new Map<string, unknown>(),
}));

vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    state.responses.get(getFunctionName(reference)),
}));
vi.mock("./AuthGate", () => ({
  useCanEditWork: () => state.canEdit,
  useIsAdministrator: () => false,
}));
vi.mock("../lib/toast", () => ({ useReportedMutation: () => vi.fn() }));

beforeEach(() => {
  state.canEdit = false;
  state.responses.clear();
});

test("Viewers can read every tier and expanded work details without editing controls", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const promotionId = promotions["Gift Sets"];
  await as.mutation(api.seasons.update, { seasonId, notes: "Year details" });
  await as.mutation(api.chainPlans.update, {
    chainPlanId: plans.Albertsons,
    notes: "Plan details",
  });
  await as.mutation(api.promotions.update, { promotionId, notes: "Promotion details" });
  await as.mutation(api.kpi.setMetric, {
    promotionId,
    metric: "investment",
    baseline: 100,
    promotional: 200,
    note: "Measurement details",
  });
  await as.mutation(api.kpi.saveRetro, {
    promotionId,
    worked: "Retro details",
    repeatNextYear: "yes",
  });
  const promotion = await as.query(api.promotions.get, { promotionId, today: TODAY });
  if (promotion === null) throw new Error("Missing promotion");
  const taskId = promotion.tasks[0]._id;
  await as.mutation(api.tasks.update, {
    taskId,
    notes: "Task details",
    proofOfExecution: "Receipt details",
  });
  const tree = await as.query(api.seasons.tree, { seasonId, today: TODAY });
  if (tree === null) throw new Error("Missing year");
  const list = await as.query(api.people.list, {});
  const people: PeopleDirectory = {
    loaded: true,
    list,
    byId: new Map(list.map((person) => [person._id, person])),
    byFunction: [],
  };
  state.responses.set(
    "seasons:overview",
    await as.query(api.seasons.overview, { seasonId, today: TODAY }),
  );
  state.responses.set(
    "chainPlans:get",
    await as.query(api.chainPlans.get, { chainPlanId: plans.Albertsons, today: TODAY }),
  );
  state.responses.set(
    "promotions:get",
    await as.query(api.promotions.get, { promotionId, today: TODAY }),
  );
  state.responses.set("kpi:board", await as.query(api.kpi.board, { promotionId }));
  state.responses.set("raci:matrix", await as.query(api.raci.matrix, {}));

  const pages = [
    <SeasonView key="year" seasonId={seasonId} today={TODAY} people={people} tree={tree} />,
    <ChainPlanView key="plan" chainPlanId={plans.Albertsons} today={TODAY} people={people} />,
    <PromotionView
      key="promotion"
      promotionId={promotionId}
      today={TODAY}
      people={people}
      focusTaskId={taskId}
    />,
  ];
  const html = pages.map((page) => renderToStaticMarkup(page)).join("");
  for (const detail of [
    "Year details",
    "Plan details",
    "Promotion details",
    "Task details",
    "Receipt details",
    "Measurement details",
    "Retro details",
    "Carol Diaz",
    "$100",
    "$200",
    "Repeat next year",
  ]) {
    expect(html).toContain(detail);
  }
  // The chain-plan sort is a way of reading the list, not of editing it, so it
  // is the one control a Viewer keeps.
  const reading = html.replace(/<select aria-label="Sort chain plans"[\s\S]*?<\/select>/g, "");
  expect(reading).not.toMatch(/<(input|textarea|select|form)\b/);
  expect(html).not.toMatch(
    /Click to edit|Click to set|Assign R|Remove Carol|Move up|Delete\?|Add the first task|Add task to phase|Click to override/,
  );
  // Expansion is still available; reading details must not be disabled with editing.
  expect(html).toContain('aria-label="Hide details"');

  state.canEdit = true;
  const editable = renderToStaticMarkup(pages[2]);
  expect(editable).toContain("Click to edit");
  expect(editable).toContain("Assign R");
  expect(editable).toContain("Add task to phase");
  expect(editable).toContain("<select");
});
