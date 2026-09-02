import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { responsiblesOf } from "./model";
import {
  ADMIN,
  type Caller,
  NEWCOMER,
  PLAN_MEMBER,
  PROMO_MEMBER,
  TODAY,
  token,
  world,
  YEAR_MEMBER,
} from "./world.fixture";

// The authorization matrix for writes (#33), asserted at the same seam the read
// matrix uses: the public mutations the browser calls, with an identity
// injected, judged only by what comes back.
//
// A refusal is a *string* here, never a boolean. The property that matters is
// that a write aimed at something out of scope fails with the same sentence a
// write aimed at something deleted fails with — so the tests compare messages,
// and a refusal that started naming the tier it refused would fail them.

/** The one sentence every wrapper-level refusal says, whatever the reason. */
const DENIED = "You don't have access to this.";

/**
 * What a call answered: `"allowed"`, or the exact sentence it was refused with.
 * Refusals are compared to each other, so the string is the whole assertion.
 */
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
    return "allowed";
  } catch (error) {
    return error instanceof ConvexError ? String(error.data) : `error: ${String(error)}`;
  }
}

/** The same, for a whole record of calls at once, so a role is one assertion. */
async function outcomes(
  calls: Record<string, () => Promise<unknown>>,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(calls).map(async ([name, call]) => [name, await outcome(call)] as const),
  );
  return Object.fromEntries(entries);
}

/** Everything a caller would need ids for, gathered once per world. */
type Handles = {
  seasonId: Id<"seasons">;
  chainId: Id<"chains">;
  chainPlanId: Id<"chainPlans">;
  promotionId: Id<"promotions">;
  taskId: Id<"tasks">;
  personId: Id<"people">;
  functionId: Id<"functions">;
  brandId: Id<"brands">;
  templateId: Id<"taskTemplates">;
};

/**
 * The world, plus the reference-data rows and ids the write matrix needs. Every
 * one of them is created through the public surface by an Administrator, which
 * is itself the "an Administrator can still do all of this" claim.
 */
async function stage() {
  const built = await world();
  const as = built.t.withIdentity(ADMIN);

  const brandId = await as.mutation(api.brands.create, { name: "Fetzer" });
  const templateId = await as.mutation(api.taskTemplates.create, {
    phase: 6,
    name: "Photo audit",
  });
  const chainId = (await as.query(api.chains.list, {})).filter(
    (chain) => chain.name === "Albertsons",
  )[0]._id;
  const promotionId = built.promotions["Gift Sets"];
  const promotion = await as.query(api.promotions.get, { promotionId, today: TODAY });

  const handles: Handles = {
    seasonId: built.seasonId,
    chainId,
    chainPlanId: built.plans.Albertsons,
    promotionId,
    taskId: promotion!.tasks[0]._id,
    personId: built.carol,
    functionId: built.functionId,
    brandId,
    templateId,
  };
  return { ...built, as, handles };
}

/**
 * Every public mutation the app has, aimed at real in-scope-for-an-Administrator
 * records. Used for the callers who should be refused *all* of them, so a new
 * mutation added without a wrapper shows up as an unrefused entry rather than
 * as nothing at all.
 */
function everyWrite(caller: Caller, ids: Handles) {
  return {
    "brands.create": () => caller.mutation(api.brands.create, { name: "Probe" }),
    "brands.update": () =>
      caller.mutation(api.brands.update, { brandId: ids.brandId, name: "Probe" }),
    "brands.remove": () => caller.mutation(api.brands.remove, { brandId: ids.brandId }),
    "chainPlans.create": () =>
      caller.mutation(api.chainPlans.create, {
        seasonId: ids.seasonId,
        chainId: ids.chainId,
      }),
    "chainPlans.update": () =>
      caller.mutation(api.chainPlans.update, {
        chainPlanId: ids.chainPlanId,
        notes: "Probe",
      }),
    "chainPlans.remove": () =>
      caller.mutation(api.chainPlans.remove, { chainPlanId: ids.chainPlanId }),
    "chains.create": () => caller.mutation(api.chains.create, { name: "Probe" }),
    "chains.update": () =>
      caller.mutation(api.chains.update, { chainId: ids.chainId, name: "Probe" }),
    "chains.remove": () => caller.mutation(api.chains.remove, { chainId: ids.chainId }),
    "kpi.setMetric": () =>
      caller.mutation(api.kpi.setMetric, {
        promotionId: ids.promotionId,
        metric: "depletions",
        baseline: 1,
      }),
    "kpi.saveRetro": () =>
      caller.mutation(api.kpi.saveRetro, {
        promotionId: ids.promotionId,
        worked: "Probe",
      }),
    "people.create": () =>
      caller.mutation(api.people.create, {
        name: "Probe",
        functionId: ids.functionId,
      }),
    "people.update": () =>
      caller.mutation(api.people.update, { personId: ids.personId, name: "Probe" }),
    "people.remove": () => caller.mutation(api.people.remove, { personId: ids.personId }),
    "people.renameFunction": () =>
      caller.mutation(api.people.renameFunction, {
        functionId: ids.functionId,
        name: "Probe",
      }),
    "promotions.create": () =>
      caller.mutation(api.promotions.create, {
        chainPlanId: ids.chainPlanId,
        name: "Probe",
        startDate: "2026-11-01",
        endDate: "2026-12-24",
      }),
    "promotions.update": () =>
      caller.mutation(api.promotions.update, {
        promotionId: ids.promotionId,
        name: "Probe",
      }),
    "promotions.remove": () =>
      caller.mutation(api.promotions.remove, { promotionId: ids.promotionId }),
    "seasons.create": () => caller.mutation(api.seasons.create, { year: 2099 }),
    "seasons.update": () =>
      caller.mutation(api.seasons.update, { seasonId: ids.seasonId, label: "Probe" }),
    "seasons.remove": () => caller.mutation(api.seasons.remove, { seasonId: ids.seasonId }),
    "taskTemplates.create": () =>
      caller.mutation(api.taskTemplates.create, { phase: 6, name: "Probe" }),
    "taskTemplates.update": () =>
      caller.mutation(api.taskTemplates.update, {
        templateId: ids.templateId,
        name: "Probe",
      }),
    "taskTemplates.remove": () =>
      caller.mutation(api.taskTemplates.remove, { templateId: ids.templateId }),
    "taskTemplates.move": () =>
      caller.mutation(api.taskTemplates.move, {
        templateId: ids.templateId,
        direction: "up",
      }),
    "taskTemplates.loadDefaults": () => caller.mutation(api.taskTemplates.loadDefaults, {}),
    "tasks.create": () =>
      caller.mutation(api.tasks.create, {
        owner: { tier: "promotion", promotionId: ids.promotionId },
        phase: 6,
        name: "Probe",
      }),
    "tasks.update": () => caller.mutation(api.tasks.update, { taskId: ids.taskId, name: "Probe" }),
    "tasks.setStatus": () =>
      caller.mutation(api.tasks.setStatus, {
        taskId: ids.taskId,
        status: "in_progress",
      }),
    "tasks.setMembership": () =>
      caller.mutation(api.tasks.setMembership, {
        taskId: ids.taskId,
        role: "consulted",
        personId: ids.personId,
        member: true,
      }),
    "tasks.remove": () => caller.mutation(api.tasks.remove, { taskId: ids.taskId }),
    "tasks.move": () => caller.mutation(api.tasks.move, { taskId: ids.taskId, direction: "down" }),
  };
}

/** The writes only an Administrator may make (#22, story 29). */
const ADMINISTRATOR_ONLY = [
  "brands.create",
  "brands.update",
  "brands.remove",
  "chainPlans.create",
  "chainPlans.remove",
  "chains.create",
  "chains.update",
  "chains.remove",
  "people.create",
  "people.update",
  "people.remove",
  "people.renameFunction",
  "promotions.create",
  "promotions.remove",
  "seasons.create",
  "seasons.remove",
  "taskTemplates.create",
  "taskTemplates.update",
  "taskTemplates.remove",
  "taskTemplates.move",
  "taskTemplates.loadDefaults",
] as const;

// --- Nobody at the door ---------------------------------------------------

test("an anonymous caller is refused by every public write", async () => {
  const { t, handles } = await stage();

  const results = await outcomes(everyWrite(t, handles));

  expect(Object.values(results).every((value) => value === DENIED)).toBe(true);
  // And nothing moved: the refusal happened before any handler ran.
  const promotion = await t
    .withIdentity(ADMIN)
    .query(api.promotions.get, { promotionId: handles.promotionId, today: TODAY });
  expect(promotion?.promotion.name).toBe("Gift Sets");
  expect(promotion?.tasks).toHaveLength(3);
});

test("a verified token with no User record yet is refused the same way", async () => {
  const { t, handles } = await stage();
  const stranger = t.withIdentity(token("user_stranger", "outsider@example.com"));

  const results = await outcomes(everyWrite(stranger, handles));

  expect(Object.values(results).every((value) => value === DENIED)).toBe(true);
});

test("a deactivated User's writes stop immediately, whatever they held", async () => {
  const { t, handles } = await stage();
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", PROMO_MEMBER.subject))
      .unique();
    await ctx.db.patch(user!._id, { isActive: false });
  });

  const results = await outcomes(everyWrite(t.withIdentity(PROMO_MEMBER), handles));

  expect(Object.values(results).every((value) => value === DENIED)).toBe(true);
});

test("a signed-in Member with no grants can write nothing at all", async () => {
  const { t, handles } = await stage();

  const results = await outcomes(everyWrite(t.withIdentity(NEWCOMER), handles));

  // The hierarchy refuses them for their role; the records refuse them for
  // their scope. Both refuse.
  for (const [name, result] of Object.entries(results)) {
    expect([name, result]).not.toEqual([name, "allowed"]);
  }
});

// --- What a Member controls inside their scope ----------------------------

test("a Promotion Member has full task control inside their scope", async () => {
  const { t, promotions, carol } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];
  const board = async () => (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!;

  // Create, with a spec, a quantity and an ETA.
  const taskId = await priya.mutation(api.tasks.create, {
    owner: { tier: "promotion", promotionId },
    phase: 6,
    name: "Shelf talkers",
    spec: "32 in",
    quantity: 20,
    eta: "2026-11-10",
    responsiblePersonIds: [carol],
  });

  // Edit the spec, the quantity and the ETA.
  await priya.mutation(api.tasks.update, {
    taskId,
    spec: "24 in",
    quantity: 40,
    eta: "2026-11-12",
  });
  // Set a status.
  await priya.mutation(api.tasks.setStatus, { taskId, status: "in_progress" });
  // Reorder it.
  await priya.mutation(api.tasks.move, { taskId, direction: "up" });

  const written = (await board()).tasks.find((task) => task._id === taskId);
  expect(written).toMatchObject({
    name: "Shelf talkers",
    spec: "24 in",
    quantity: 40,
    eta: "2026-11-12",
    status: "in_progress",
    responsiblePersonIds: [carol],
  });
  expect((await board()).tasks.at(-1)?._id).not.toBe(taskId);

  // And delete it, back to the three the world was seeded with.
  await priya.mutation(api.tasks.remove, { taskId });
  expect((await board()).tasks).toHaveLength(3);
});

test("a Member assigns RACI from the whole People directory, other functions included", async () => {
  const { t, promotions, carol } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];

  // A person in a Function of their own — the case story 14 is about: naming
  // the right owner even when they sit somewhere else in the org.
  const financeId = await t.run(
    async (ctx) =>
      await ctx.db.insert("functions", {
        key: "finance",
        name: "Finance",
        kind: "internal",
        order: 4,
      }),
  );
  const frank = await t
    .withIdentity(ADMIN)
    .mutation(api.people.create, { name: "Frank Ng", functionId: financeId });

  // The picker's source is the whole directory, for a Member as much as an
  // Administrator (#22, story 18).
  expect((await priya.query(api.people.list, {})).map((person) => person.name)).toEqual([
    "Carol Diaz",
    "Frank Ng",
  ]);

  const taskId = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!.tasks[0]
    ._id;
  // The many-person columns change one membership at a time (tasks.setMembership);
  // A is the one single-person column and still goes through `update`.
  await priya.mutation(api.tasks.update, { taskId, accountablePersonId: frank });
  for (const [role, personId] of [
    ["responsible", carol],
    ["responsible", frank],
    ["consulted", carol],
    ["informed", frank],
  ] as const) {
    await priya.mutation(api.tasks.setMembership, { taskId, role, personId, member: true });
  }

  const task = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!.tasks.find(
    (row) => row._id === taskId,
  );
  expect(task).toMatchObject({
    responsiblePersonIds: [carol, frank],
    accountablePersonId: frank,
    consultedPersonIds: [carol],
    informedPersonIds: [frank],
  });
});

test("a Member blocking a task still has to say what is blocking it", async () => {
  const { t, promotions } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];
  const tasks = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!.tasks;
  const fresh = tasks.find((task) => task.status === "not_started")!._id;

  expect(
    await outcome(() => priya.mutation(api.tasks.setStatus, { taskId: fresh, status: "blocked" })),
  ).toBe("A blocked task needs a reason — say what is blocking it.");
  expect(
    await outcome(() =>
      priya.mutation(api.tasks.setStatus, {
        taskId: fresh,
        status: "blocked",
        blockedReason: "   ",
      }),
    ),
  ).toBe("A blocked task needs a reason — say what is blocking it.");

  await priya.mutation(api.tasks.setStatus, {
    taskId: fresh,
    status: "blocked",
    blockedReason: "No inventory at distributor",
  });
  const blocked = (await priya.query(api.promotions.get, {
    promotionId,
    today: TODAY,
  }))!.tasks.find((task) => task._id === fresh);
  expect(blocked).toMatchObject({
    status: "blocked",
    blockedReason: "No inventory at distributor",
  });

  // Moving off Blocked drops the reason rather than leaving it to mislead.
  await priya.mutation(api.tasks.setStatus, { taskId: fresh, status: "delivered" });
  const delivered = (await priya.query(api.promotions.get, {
    promotionId,
    today: TODAY,
  }))!.tasks.find((task) => task._id === fresh);
  expect(delivered?.blockedReason).toBeUndefined();
});

test("a Member edits the fields of every record their scope covers", async () => {
  const { t, seasonId, plans, promotions, handles } = await stage();

  // The Promotion Member: the promotion's own name, window, stores and brands.
  const priya = t.withIdentity(PROMO_MEMBER);
  await priya.mutation(api.promotions.update, {
    promotionId: promotions["Gift Sets"],
    name: "Gift Sets 2026",
    startDate: "2026-11-05",
    endDate: "2026-12-20",
    storeCount: 240,
    brandIds: [handles.brandId],
    notes: "Endcap confirmed",
  });
  expect(
    (await priya.query(api.promotions.get, {
      promotionId: promotions["Gift Sets"],
      today: TODAY,
    }))!.promotion,
  ).toMatchObject({
    name: "Gift Sets 2026",
    startDate: "2026-11-05",
    endDate: "2026-12-20",
    storeCount: 240,
    brandIds: [handles.brandId],
  });

  // The Chain Plan Member: the plan's phase, JBP date and notes, and the
  // promotions underneath it.
  const marcus = t.withIdentity(PLAN_MEMBER);
  await marcus.mutation(api.chainPlans.update, {
    chainPlanId: plans.Kroger,
    currentPhase: 3,
    jbpDate: "2026-09-01",
  });
  await marcus.mutation(api.promotions.update, {
    promotionId: promotions["Holiday Endcap"],
    storeCount: 90,
  });
  const plan = await marcus.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  });
  expect(plan?.plan).toMatchObject({ currentPhase: 3, jbpDate: "2026-09-01" });
  expect(plan?.promotions[0].promotion.storeCount).toBe(90);

  // The Plan Year Member: the year's own label and notes.
  const yolanda = t.withIdentity(YEAR_MEMBER);
  await yolanda.mutation(api.seasons.update, {
    seasonId,
    label: "2026 plan",
    notes: "Targets signed off",
  });
  expect(
    (await yolanda.query(api.seasons.overview, { seasonId, today: TODAY }))!.season,
  ).toMatchObject({ label: "2026 plan", notes: "Targets signed off" });
});

test("a Member writes the KPI entries and the Retro of a covered Promotion", async () => {
  const { t, promotions } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];

  await priya.mutation(api.kpi.setMetric, {
    promotionId,
    metric: "depletions",
    baseline: 100,
    promotional: 130,
  });
  await priya.mutation(api.kpi.saveRetro, {
    promotionId,
    worked: "Endcap placement",
    didntWork: "Late POS",
    repeatNextYear: "yes",
  });

  const board = await priya.query(api.kpi.board, { promotionId });
  expect(board?.metrics).toMatchObject([
    { metric: "depletions", baseline: 100, promotional: 130, uplift: { absolute: 30 } },
  ]);
  expect(board?.retro).toMatchObject({
    worked: "Endcap placement",
    didntWork: "Late POS",
    repeatNextYear: "yes",
  });

  // Clearing every field takes the row away rather than leaving a husk.
  await priya.mutation(api.kpi.setMetric, {
    promotionId,
    metric: "depletions",
    baseline: null,
    promotional: null,
  });
  expect((await priya.query(api.kpi.board, { promotionId }))?.metrics).toEqual([]);
});

test("a Plan Year Member reaches phase 0 and every checklist under the year", async () => {
  const { t, seasonId, plans, promotions } = await stage();
  const yolanda = t.withIdentity(YEAR_MEMBER);

  const phaseZero = (await yolanda.query(api.seasons.overview, {
    seasonId,
    today: TODAY,
  }))!.tasks[0]._id;

  const results = await outcomes({
    phaseZeroTask: () =>
      yolanda.mutation(api.tasks.update, { taskId: phaseZero, name: "Trade budget" }),
    seasonTaskCreate: () =>
      yolanda.mutation(api.tasks.create, {
        owner: { tier: "season", seasonId },
        phase: 0,
        name: "Portfolio strategy",
      }),
    planTaskCreate: () =>
      yolanda.mutation(api.tasks.create, {
        owner: { tier: "chainPlan", chainPlanId: plans.Ralphs },
        phase: 2,
        name: "Distributor alignment",
      }),
    promotionTaskCreate: () =>
      yolanda.mutation(api.tasks.create, {
        owner: { tier: "promotion", promotionId: promotions["Spring Rosé"] },
        phase: 6,
        name: "Store audit",
      }),
    promotionEdit: () =>
      yolanda.mutation(api.promotions.update, {
        promotionId: promotions["Holiday Endcap"],
        storeCount: 12,
      }),
  });

  expect(Object.values(results).every((value) => value === "allowed")).toBe(true);
});

// --- Out of scope writes exactly like deleted -----------------------------

test("an out-of-scope write fails byte for byte like a write to a deleted record", async () => {
  const { t, as, seasonId, plans, promotions } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const sibling = promotions["Spring Rosé"];
  const siblingTask = (await as.query(api.promotions.get, {
    promotionId: sibling,
    today: TODAY,
  }))!.tasks[0]._id;

  /** The same eight writes, aimed at records Priya's one grant does not reach. */
  const attempts = () =>
    outcomes({
      promotionUpdate: () =>
        priya.mutation(api.promotions.update, {
          promotionId: sibling,
          name: "Renamed",
        }),
      promotionTaskCreate: () =>
        priya.mutation(api.tasks.create, {
          owner: { tier: "promotion", promotionId: sibling },
          phase: 6,
          name: "Sneak",
        }),
      taskUpdate: () => priya.mutation(api.tasks.update, { taskId: siblingTask, name: "Renamed" }),
      taskStatus: () =>
        priya.mutation(api.tasks.setStatus, {
          taskId: siblingTask,
          status: "delivered",
        }),
      taskMove: () => priya.mutation(api.tasks.move, { taskId: siblingTask, direction: "up" }),
      taskRemove: () => priya.mutation(api.tasks.remove, { taskId: siblingTask }),
      kpi: () =>
        priya.mutation(api.kpi.setMetric, {
          promotionId: sibling,
          metric: "cwd",
          baseline: 3,
        }),
      retro: () => priya.mutation(api.kpi.saveRetro, { promotionId: sibling, worked: "Nothing" }),
      planUpdate: () =>
        priya.mutation(api.chainPlans.update, {
          chainPlanId: plans.Kroger,
          notes: "Renamed",
        }),
      planTaskCreate: () =>
        priya.mutation(api.tasks.create, {
          owner: { tier: "chainPlan", chainPlanId: plans.Kroger },
          phase: 2,
          name: "Sneak",
        }),
      seasonUpdate: () => priya.mutation(api.seasons.update, { seasonId, label: "Mine" }),
      seasonTaskCreate: () =>
        priya.mutation(api.tasks.create, {
          owner: { tier: "season", seasonId },
          phase: 0,
          name: "Sneak",
        }),
    });

  const outOfScope = await attempts();
  // Nothing got through, and nothing named a tier back at her.
  expect(Object.values(outOfScope).every((value) => value !== "allowed")).toBe(true);

  // Now genuinely delete every record she could not reach — the whole tree, so
  // the season answers for itself too.
  for (const promotionId of Object.values(promotions)) {
    await as.mutation(api.promotions.remove, { promotionId });
  }
  for (const chainPlanId of Object.values(plans)) {
    await as.mutation(api.chainPlans.remove, { chainPlanId });
  }
  await as.mutation(api.seasons.remove, { seasonId });

  expect(await attempts()).toEqual(outOfScope);
});

test("a create is refused by the loaded parent's ancestry, not by its argument", async () => {
  const { t, as, seasonId, plans, promotions } = await stage();
  const marcus = t.withIdentity(PLAN_MEMBER);

  // Marcus holds the Kroger plan. Naming any other parent is refused exactly as
  // naming a deleted one is — the argument is a lookup key, never a claim.
  const aimedElsewhere = await outcomes({
    otherPlan: () =>
      marcus.mutation(api.tasks.create, {
        owner: { tier: "chainPlan", chainPlanId: plans.Albertsons },
        phase: 2,
        name: "Sneak",
      }),
    otherPromotion: () =>
      marcus.mutation(api.tasks.create, {
        owner: { tier: "promotion", promotionId: promotions["Gift Sets"] },
        phase: 6,
        name: "Sneak",
      }),
    theYearAbove: () =>
      marcus.mutation(api.tasks.create, {
        owner: { tier: "season", seasonId },
        phase: 0,
        name: "Sneak",
      }),
  });

  expect(aimedElsewhere).toEqual({
    otherPlan: "That chain plan no longer exists.",
    otherPromotion: "That promotion no longer exists.",
    theYearAbove: "That season no longer exists.",
  });

  // His own plan and the promotion under it, by contrast, are simply work.
  expect(
    await outcomes({
      ownPlan: () =>
        marcus.mutation(api.tasks.create, {
          owner: { tier: "chainPlan", chainPlanId: plans.Kroger },
          phase: 2,
          name: "Distributor alignment",
        }),
      ownPromotion: () =>
        marcus.mutation(api.tasks.create, {
          owner: { tier: "promotion", promotionId: promotions["Holiday Endcap"] },
          phase: 6,
          name: "Store audit",
        }),
    }),
  ).toEqual({ ownPlan: "allowed", ownPromotion: "allowed" });

  // And a Promotion created under his plan after the fact is his too — grants
  // are not snapshots.
  const later = await as.mutation(api.promotions.create, {
    chainPlanId: plans.Kroger,
    name: "New Year Reset",
    startDate: "2026-12-28",
    endDate: "2027-01-15",
  });
  expect(
    await outcome(() =>
      marcus.mutation(api.promotions.update, { promotionId: later, storeCount: 30 }),
    ),
  ).toBe("allowed");
});

// --- The Administrator's exclusive rights ---------------------------------

test("hierarchy, reference-data and People writes are refused for every Member", async () => {
  const { t, handles } = await stage();

  for (const who of [YEAR_MEMBER, PLAN_MEMBER, PROMO_MEMBER, NEWCOMER]) {
    const results = await outcomes(everyWrite(t.withIdentity(who), handles));
    const governed = Object.fromEntries(ADMINISTRATOR_ONLY.map((name) => [name, results[name]]));

    // One sentence for all of them: a Member who probes cannot tell "you are
    // not an Administrator" from any other refusal the app makes.
    expect(governed).toEqual(Object.fromEntries(ADMINISTRATOR_ONLY.map((name) => [name, DENIED])));
  }
});

test("the same writes all succeed for an Administrator", async () => {
  const { t, as, seasonId, handles } = await stage();

  const results = await outcomes({
    "chains.create": () => as.mutation(api.chains.create, { name: "Vons" }),
    "chains.update": () =>
      as.mutation(api.chains.update, { chainId: handles.chainId, notes: "West coast" }),
    "brands.create": () => as.mutation(api.brands.create, { name: "Bonterra" }),
    "brands.update": () =>
      as.mutation(api.brands.update, { brandId: handles.brandId, isPlaceholder: false }),
    "brands.remove": () => as.mutation(api.brands.remove, { brandId: handles.brandId }),
    "people.renameFunction": () =>
      as.mutation(api.people.renameFunction, {
        functionId: handles.functionId,
        name: "Retail Marketing / Local Sales",
      }),
    "people.update": () =>
      as.mutation(api.people.update, {
        personId: handles.personId,
        title: "Field Manager",
      }),
    "taskTemplates.update": () =>
      as.mutation(api.taskTemplates.update, {
        templateId: handles.templateId,
        spec: "Two shots per store",
      }),
    "taskTemplates.move": () =>
      as.mutation(api.taskTemplates.move, {
        templateId: handles.templateId,
        direction: "up",
      }),
    "taskTemplates.remove": () =>
      as.mutation(api.taskTemplates.remove, { templateId: handles.templateId }),
    "seasons.create": () => as.mutation(api.seasons.create, { year: 2027 }),
    "seasons.update": () => as.mutation(api.seasons.update, { seasonId, notes: "Signed off" }),
  });

  expect(results).toEqual(
    Object.fromEntries(Object.keys(results).map((name) => [name, "allowed"])),
  );

  // A new Person, then removing them: the create has to land before the remove
  // has a target, so they are sequenced rather than swept.
  const probe = await as.mutation(api.people.create, {
    name: "Probe Person",
    functionId: handles.functionId,
  });
  expect(await outcome(() => as.mutation(api.people.remove, { personId: probe }))).toBe("allowed");
  expect((await t.withIdentity(ADMIN).query(api.people.list, {})).length).toBe(1);
});

// --- The stamp ------------------------------------------------------------

test("an edit records who made it, everywhere the record is shown", async () => {
  const { t, as, plans, promotions } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];

  // Everything in the world was created by the Administrator, so that is the
  // first answer every record gives.
  const before = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!;
  expect(before.editors[before.promotion.lastModifiedBy!]).toBe(ADMIN.name);

  await priya.mutation(api.promotions.update, { promotionId, storeCount: 300 });
  const taskId = before.tasks[0]._id;
  await priya.mutation(api.tasks.update, { taskId, spec: "24 in" });

  const after = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!;
  const stampOf = (record: { lastModifiedBy?: Id<"users">; lastModifiedAt?: number }) => ({
    by: after.editors[record.lastModifiedBy!],
    at: typeof record.lastModifiedAt,
  });

  expect(stampOf(after.promotion)).toEqual({ by: PROMO_MEMBER.name, at: "number" });
  expect(stampOf(after.tasks.find((task) => task._id === taskId)!)).toEqual({
    by: PROMO_MEMBER.name,
    at: "number",
  });
  // A row she did not touch still names whoever did.
  expect(stampOf(after.tasks.find((task) => task._id !== taskId)!)).toEqual({
    by: ADMIN.name,
    at: "number",
  });
  // Two editors on one page resolve to two names, and to nobody else's.
  expect(new Set(Object.values(after.editors))).toEqual(new Set([ADMIN.name, PROMO_MEMBER.name]));

  // A membership request that changes nothing writes nothing — so it does not
  // re-stamp the row as edited by someone who changed nothing.
  const carolOnRow = (await as.query(api.promotions.get, {
    promotionId,
    today: TODAY,
  }))!.tasks.find((task) => responsiblesOf(task).length > 0)!;
  const responsible = responsiblesOf(carolOnRow)[0];
  if (responsible === undefined) throw new Error("expected a Responsible on the fixture row");
  await as.mutation(api.tasks.setMembership, {
    taskId: carolOnRow._id,
    role: "responsible",
    personId: responsible,
    member: true,
  });
  const untouched = (await as.query(api.promotions.get, { promotionId, today: TODAY }))!.tasks.find(
    (task) => task._id === carolOnRow._id,
  )!;
  expect(untouched.lastModifiedBy).toBe(carolOnRow.lastModifiedBy);
  expect(untouched.lastModifiedAt).toBe(carolOnRow.lastModifiedAt);

  // The same stamp on the other two tiers, and on the phase 7-8 rows.
  await t
    .withIdentity(PLAN_MEMBER)
    .mutation(api.chainPlans.update, { chainPlanId: plans.Kroger, notes: "Signed" });
  const plan = (await as.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  }))!;
  expect(plan.editors[plan.plan.lastModifiedBy!]).toBe(PLAN_MEMBER.name);

  await priya.mutation(api.kpi.saveRetro, { promotionId, worked: "Endcap placement" });
  const board = (await priya.query(api.kpi.board, { promotionId }))!;
  expect(board.editors[board.retro!.lastModifiedBy!]).toBe(PROMO_MEMBER.name);
});

test("an editor with no name is Someone, never their work address", async () => {
  const { t, promotions } = await stage();
  const promotionId = promotions["Gift Sets"];

  // An identity whose token carried no `name` claim — a Google account with no
  // name set, or a session token missing the customization:
  // a display name is all this payload may carry, so there is no rung below it
  // that leaks an address to every Member on the page.
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", PROMO_MEMBER.subject))
      .unique();
    await ctx.db.patch(user!._id, { displayName: undefined });
  });

  const priya = t.withIdentity(PROMO_MEMBER);
  await priya.mutation(api.promotions.update, { promotionId, storeCount: 300 });

  const after = (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!;
  expect(after.editors[after.promotion.lastModifiedBy!]).toBe("Someone");
  expect(JSON.stringify(after.editors)).not.toContain(PROMO_MEMBER.email);
});

// --- A phase belongs to exactly one tier ----------------------------------

test("a Member cannot label their plan or promotion with another tier's phase", async () => {
  const { t, plans, promotions } = await stage();

  // The picker offers only the tier's own phases, but the client is not the
  // boundary: a chain plan on phase 7 or a promotion on phase 0 reads as a
  // phase that tier never runs, in the nav tree and the pathway strip alike.
  // The argument validator is that boundary (model.ts: chainPlanPhase,
  // promotionPhase), so the types forbid it too — hence the expect-error.
  await expect(
    t
      .withIdentity(PLAN_MEMBER)
      // @ts-expect-error a promotion's phase is not a chain plan's
      .mutation(api.chainPlans.update, { chainPlanId: plans.Kroger, currentPhase: 7 }),
  ).rejects.toThrow(/Validator error/);

  await expect(
    t.withIdentity(PROMO_MEMBER).mutation(api.promotions.update, {
      promotionId: promotions["Gift Sets"],
      // @ts-expect-error the plan year's phase is not a promotion's
      currentPhase: 0,
    }),
  ).rejects.toThrow(/Validator error/);

  // The tier's own phases still move freely — this is a shape rule, not a lock.
  await t
    .withIdentity(PLAN_MEMBER)
    .mutation(api.chainPlans.update, { chainPlanId: plans.Kroger, currentPhase: 3 });
  await t.withIdentity(PROMO_MEMBER).mutation(api.promotions.update, {
    promotionId: promotions["Gift Sets"],
    currentPhase: 8,
  });
});

// --- The derived states are unchanged -------------------------------------

test("Unassigned, Blocked and Overdue mean the same thing after a Member writes", async () => {
  const { t, promotions, carol } = await stage();
  const priya = t.withIdentity(PROMO_MEMBER);
  const promotionId = promotions["Gift Sets"];
  const rollupOf = async () =>
    (await priya.query(api.promotions.get, { promotionId, today: TODAY }))!.rollup;

  // The seeded three: one unowned, one blocked, one late.
  expect(await rollupOf()).toMatchObject({
    total: 3,
    unassigned: 1,
    blocked: 1,
    overdue: 1,
  });

  // A new row with no Responsible is Unassigned; giving it one is not.
  const fresh = await priya.mutation(api.tasks.create, {
    owner: { tier: "promotion", promotionId },
    phase: 6,
    name: "Photo audit",
    eta: "2026-01-02",
  });
  expect(await rollupOf()).toMatchObject({ total: 4, unassigned: 2, overdue: 2 });

  await priya.mutation(api.tasks.setMembership, {
    taskId: fresh,
    role: "responsible",
    personId: carol,
    member: true,
  });
  expect(await rollupOf()).toMatchObject({ unassigned: 1, overdue: 2 });

  // Delivered work cannot be late, however far past its ETA it is.
  await priya.mutation(api.tasks.setStatus, { taskId: fresh, status: "delivered" });
  expect(await rollupOf()).toMatchObject({ delivered: 1, overdue: 1 });

  // Blocking counts, unblocking stops counting.
  await priya.mutation(api.tasks.setStatus, {
    taskId: fresh,
    status: "blocked",
    blockedReason: "Waiting on artwork",
  });
  expect(await rollupOf()).toMatchObject({ blocked: 2, delivered: 0 });
});

// --- The Administrator's world is unchanged -------------------------------

test("the demo arc still runs end to end under an Administrator identity", async () => {
  const { t, as } = await stage();

  const seasonId = await as.mutation(api.seasons.create, { year: 2028 });
  const chainId = await as.mutation(api.chains.create, { name: "Safeway" });
  const brandId = await as.mutation(api.brands.create, { name: "Concha y Toro" });
  const chainPlanId = await as.mutation(api.chainPlans.create, { seasonId, chainId });
  const promotionId = await as.mutation(api.promotions.create, {
    chainPlanId,
    name: "Summer Rosé",
    brandIds: [brandId],
    startDate: "2028-06-01",
    endDate: "2028-07-15",
    storeCount: 180,
  });

  const functionId = await t.run(
    async (ctx) =>
      await ctx.db.insert("functions", {
        key: "marketing",
        name: "Marketing",
        kind: "internal",
        order: 2,
      }),
  );
  const owner = await as.mutation(api.people.create, {
    name: "Dana Ruiz",
    functionId,
  });

  const taskId = await as.mutation(api.tasks.create, {
    owner: { tier: "promotion", promotionId },
    phase: 6,
    name: "Endcap build",
    quantity: 180,
    eta: "2028-05-25",
    responsiblePersonIds: [owner],
  });
  await as.mutation(api.tasks.update, { taskId, accountablePersonId: owner });
  await as.mutation(api.tasks.setStatus, {
    taskId,
    status: "blocked",
    blockedReason: "No inventory at distributor",
  });
  await as.mutation(api.tasks.setStatus, {
    taskId,
    status: "delivered",
    deliveredTo: "Store ops",
  });
  await as.mutation(api.kpi.setMetric, {
    promotionId,
    metric: "depletions",
    baseline: 900,
    promotional: 1180,
  });
  await as.mutation(api.kpi.saveRetro, {
    promotionId,
    worked: "Endcap placement",
    repeatNextYear: "yes",
  });

  const page = await as.query(api.promotions.get, { promotionId, today: "2028-06-15" });
  expect(page?.promotion.name).toBe("Summer Rosé");
  expect(page?.brands.map((brand) => brand.name)).toEqual(["Concha y Toro"]);
  // Two rows: the one typed above, and the phase-6 Task Template stamped onto
  // the promotion when it was created.
  expect(page?.tasks.map((task) => task.name)).toEqual(["Photo audit", "Endcap build"]);
  expect(page?.rollup).toMatchObject({
    total: 2,
    delivered: 1,
    unassigned: 1,
    overdue: 0,
    blocked: 0,
  });
  expect((await as.query(api.kpi.board, { promotionId }))?.metrics[0].uplift).toEqual({
    absolute: 280,
    percent: (280 / 900) * 100,
  });
  expect(await as.query(api.home.dashboard, { seasonId, today: "2028-06-15" })).not.toBeNull();

  // And back down again, in the order the guards demand.
  await as.mutation(api.tasks.remove, { taskId });
  await as.mutation(api.promotions.remove, { promotionId });
  await as.mutation(api.chainPlans.remove, { chainPlanId });
  await as.mutation(api.seasons.remove, { seasonId });
  await as.mutation(api.chains.remove, { chainId });
  await as.mutation(api.brands.remove, { brandId });
  await as.mutation(api.people.remove, { personId: owner });

  expect(await as.query(api.seasons.overview, { seasonId, today: "2028-06-15" })).toBeNull();
});
