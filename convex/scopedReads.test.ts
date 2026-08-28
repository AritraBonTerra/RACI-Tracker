import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ADMIN,
  NEWCOMER,
  PLAN_MEMBER,
  PROMO_MEMBER,
  TODAY,
  YEAR_MEMBER,
  bytes,
  token,
  world,
  type Caller,
} from "./world.fixture";

// The authorization matrix for reads (#32), asserted the only way it is worth
// asserting: by calling the public functions the browser calls, with an
// identity injected, and looking at what comes back.
//
// Nothing here reaches into a table to check a result and nothing here knows
// what a wrapper is. A Member is defined by what they get, and the property
// that matters most — "out of scope is indistinguishable from deleted" — is
// checked by comparing the two responses byte for byte.
//
// The world these claims are made about lives in `world.fixture.ts`, shared
// with the write matrix (#33) so both are arguing over the same records.

/** Every public read, called at once, so a whole role is one assertion. */
async function reads(
  caller: Caller,
  ids: {
    seasonId: Id<"seasons">;
    chainPlanId: Id<"chainPlans">;
    promotionId: Id<"promotions">;
  },
) {
  const attempt = async <T>(call: () => Promise<T>) => {
    try {
      return await call();
    } catch {
      return "refused" as const;
    }
  };
  return {
    seasons: await attempt(() => caller.query(api.seasons.list, {})),
    overview: await attempt(() =>
      caller.query(api.seasons.overview, { seasonId: ids.seasonId, today: TODAY }),
    ),
    tree: await attempt(() =>
      caller.query(api.seasons.tree, { seasonId: ids.seasonId, today: TODAY }),
    ),
    contextFor: await attempt(() =>
      caller.query(api.seasons.contextFor, { chainPlanId: ids.chainPlanId }),
    ),
    chainPlan: await attempt(() =>
      caller.query(api.chainPlans.get, {
        chainPlanId: ids.chainPlanId,
        today: TODAY,
      }),
    ),
    promotion: await attempt(() =>
      caller.query(api.promotions.get, {
        promotionId: ids.promotionId,
        today: TODAY,
      }),
    ),
    dashboard: await attempt(() =>
      caller.query(api.home.dashboard, { seasonId: ids.seasonId, today: TODAY }),
    ),
    kpi: await attempt(() =>
      caller.query(api.kpi.board, { promotionId: ids.promotionId }),
    ),
    people: await attempt(() => caller.query(api.people.list, {})),
    functions: await attempt(() => caller.query(api.people.listFunctions, {})),
    directory: await attempt(() => caller.query(api.people.directory, { today: TODAY })),
    workload: await attempt(() =>
      caller.query(api.people.workload, { personId: "nobody", today: TODAY }),
    ),
    brands: await attempt(() => caller.query(api.brands.list, {})),
    chains: await attempt(() => caller.query(api.chains.list, {})),
    raci: await attempt(() => caller.query(api.raci.matrix, {})),
    templates: await attempt(() => caller.query(api.taskTemplates.list, {})),
  };
}

// --- Nobody at the door ---------------------------------------------------

test("an anonymous caller is refused by every public read", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const ids = {
    seasonId,
    chainPlanId: plans.Kroger,
    promotionId: promotions["Gift Sets"],
  };

  const results = await reads(t, ids);

  expect(Object.values(results).every((value) => value === "refused")).toBe(true);
  // Not one byte of a record on the wire — the check the frontend can never be.
  expect(JSON.stringify(results)).not.toContain("Kroger");
});

test("a verified token with no User record yet is refused the same way", async () => {
  // Clerk says they are signed in; this app has never heard of them.
  const { t, seasonId, plans, promotions } = await world();
  const stranger = t.withIdentity(token("user_stranger", "outsider@example.com"));

  const results = await reads(stranger, {
    seasonId,
    chainPlanId: plans.Kroger,
    promotionId: promotions["Gift Sets"],
  });

  expect(Object.values(results).every((value) => value === "refused")).toBe(true);
});

test("a signed-in Member with no grants gets reference data and nothing else", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const sam = t.withIdentity(NEWCOMER);

  const results = await reads(sam, {
    seasonId,
    chainPlanId: plans.Kroger,
    promotionId: promotions["Gift Sets"],
  });

  // Readable by every authenticated User (#22): pickers and labels need them.
  expect(results.people).toHaveLength(1);
  expect(results.functions).toHaveLength(1);
  expect(results.chains).toHaveLength(3);
  expect(results.brands).toEqual([]);
  expect(results.raci).not.toBe("refused");

  // Everything that belongs to somebody's plan is simply not there.
  expect(results.seasons).toEqual([]);
  expect(results.overview).toBeNull();
  expect(results.tree).toBeNull();
  expect(results.contextFor).toBeNull();
  expect(results.chainPlan).toBeNull();
  expect(results.promotion).toBeNull();
  expect(results.dashboard).toBeNull();
  expect(results.kpi).toBeNull();

  // Manage is an Administrator surface, so its data is too.
  expect(results.templates).toBe("refused");
});

// --- The scope matrix, one level at a time --------------------------------

test("a Promotion-only Member sees their promotion and no sibling, plan or year", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const priya = t.withIdentity(PROMO_MEMBER);

  const granted = await priya.query(api.promotions.get, {
    promotionId: promotions["Gift Sets"],
    today: TODAY,
  });
  expect(granted?.promotion.name).toBe("Gift Sets");
  expect(granted?.tasks).toHaveLength(3);
  // The two ancestors come back as names with no way through them.
  expect(granted?.chain.name).toBe("Albertsons");
  expect(granted?.plan.reach).toBe("context");
  expect(granted?.season.reach).toBe("context");

  // The sibling under the same plan is as absent as a deleted record.
  expect(
    await priya.query(api.promotions.get, {
      promotionId: promotions["Spring Rosé"],
      today: TODAY,
    }),
  ).toBeNull();
  expect(
    await priya.query(api.chainPlans.get, {
      chainPlanId: plans.Albertsons,
      today: TODAY,
    }),
  ).toBeNull();
  expect(
    await priya.query(api.seasons.overview, { seasonId, today: TODAY }),
  ).toBeNull();

  // The whole world they can navigate: one year label, one chain label, one
  // promotion. Nothing else is named anywhere in the response.
  const tree = await priya.query(api.seasons.tree, { seasonId, today: TODAY });
  expect(tree?.reach).toBe("context");
  expect(tree?.seasonRollup).toBeNull();
  expect(tree?.chains).toHaveLength(1);
  expect(tree?.chains[0].chain.name).toBe("Albertsons");
  expect(tree?.chains[0].plans[0].reach).toBe("context");
  expect(tree?.chains[0].plans[0].promotions.map((node) => node.promotion.name)).toEqual([
    "Gift Sets",
  ]);
  expect(JSON.stringify(tree)).not.toContain("Spring Rosé");
  expect(JSON.stringify(tree)).not.toContain("Kroger");
  expect(JSON.stringify(tree)).not.toContain("Phase zero");
});

test("a Promotion-only Member lands on their promotion instead of the dashboard", async () => {
  const { t, promotions } = await world();

  expect(await t.withIdentity(PROMO_MEMBER).query(api.access.me, {})).toMatchObject({
    landing: { kind: "promotion", promotionId: promotions["Gift Sets"] },
  });
  // Everyone with more than one thing to look at gets the dashboard.
  expect(await t.withIdentity(PLAN_MEMBER).query(api.access.me, {})).toMatchObject({
    landing: { kind: "dashboard" },
  });
  expect(await t.withIdentity(ADMIN).query(api.access.me, {})).toMatchObject({
    landing: { kind: "dashboard" },
  });
});

test("a Chain Plan Member sees the plan and every promotion under it", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const marcus = t.withIdentity(PLAN_MEMBER);

  const plan = await marcus.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  });
  expect(plan?.chain.name).toBe("Kroger");
  expect(plan?.tasks).toHaveLength(3);
  expect(plan?.season.reach).toBe("context");
  expect(plan?.promotions.map((node) => node.promotion.name)).toEqual([
    "Holiday Endcap",
  ]);

  expect(
    await marcus.query(api.promotions.get, {
      promotionId: promotions["Holiday Endcap"],
      today: TODAY,
    }),
  ).not.toBeNull();
  expect(
    await marcus.query(api.promotions.get, {
      promotionId: promotions["Gift Sets"],
      today: TODAY,
    }),
  ).toBeNull();
  // Phase 0 belongs to the year, not to a plan under it.
  expect(await marcus.query(api.seasons.overview, { seasonId, today: TODAY })).toBeNull();

  const tree = await marcus.query(api.seasons.tree, { seasonId, today: TODAY });
  expect(tree?.chains.map((node) => node.chain.name)).toEqual(["Kroger"]);
  expect(tree?.chains[0].plans[0].reach).toBe("full");
});

test("a Plan Year Member sees phase 0 and everything under the year", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const yolanda = t.withIdentity(YEAR_MEMBER);

  const overview = await yolanda.query(api.seasons.overview, { seasonId, today: TODAY });
  expect(overview?.tasks).toHaveLength(3);

  const tree = await yolanda.query(api.seasons.tree, { seasonId, today: TODAY });
  expect(tree?.reach).toBe("full");
  expect(tree?.chains.map((node) => node.chain.name)).toEqual([
    "Albertsons",
    "Kroger",
    "Ralphs",
  ]);
  expect(tree?.chains.every((node) => node.plans[0].reach === "full")).toBe(true);

  for (const promotionId of Object.values(promotions)) {
    expect(
      await yolanda.query(api.promotions.get, { promotionId, today: TODAY }),
    ).not.toBeNull();
  }
  expect(
    await yolanda.query(api.chainPlans.get, {
      chainPlanId: plans.Ralphs,
      today: TODAY,
    }),
  ).not.toBeNull();
});

// --- Inheritance is dynamic, not snapshotted ------------------------------

test("records created after a grant are inside it", async () => {
  const { t, seasonId, plans } = await world();
  const as = t.withIdentity(ADMIN);

  // A promotion added to Marcus's plan, and a whole chain plan added to
  // Yolanda's year, both long after their grants were written.
  const newPromotion = await as.mutation(api.promotions.create, {
    chainPlanId: plans.Kroger,
    name: "New Year Reset",
    startDate: "2026-12-28",
    endDate: "2027-01-15",
  });
  const vonsId = await as.mutation(api.chains.create, { name: "Vons" });
  const vonsPlan = await as.mutation(api.chainPlans.create, {
    seasonId,
    chainId: vonsId,
  });

  expect(
    await t
      .withIdentity(PLAN_MEMBER)
      .query(api.promotions.get, { promotionId: newPromotion, today: TODAY }),
  ).not.toBeNull();
  expect(
    await t
      .withIdentity(YEAR_MEMBER)
      .query(api.chainPlans.get, { chainPlanId: vonsPlan, today: TODAY }),
  ).not.toBeNull();
  // Still nobody else's.
  expect(
    await t
      .withIdentity(PROMO_MEMBER)
      .query(api.promotions.get, { promotionId: newPromotion, today: TODAY }),
  ).toBeNull();
});

// --- Union semantics ------------------------------------------------------

test("an overlapping grant changes nothing, and revoking it changes nothing back", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const marcus = t.withIdentity(PLAN_MEMBER);
  const view = async () =>
    bytes(await marcus.query(api.seasons.tree, { seasonId, today: TODAY }));

  const before = await view();

  // A second grant to a promotion the plan grant already covers.
  const redundant = {
    email: PLAN_MEMBER.email,
    scope: { tier: "promotion", promotionId: promotions["Holiday Endcap"] },
  } as const;
  await t.mutation(internal.bootstrap.grantAccess, redundant);
  expect(await view()).toBe(before);

  await t.mutation(internal.bootstrap.revokeAccess, redundant);
  expect(await view()).toBe(before);

  // The last grant is the one that mattered: revoking it empties the world.
  await t.mutation(internal.bootstrap.revokeAccess, {
    email: PLAN_MEMBER.email,
    scope: { tier: "chainPlan", chainPlanId: plans.Kroger },
  });
  expect(await marcus.query(api.seasons.tree, { seasonId, today: TODAY })).toBeNull();
  expect(await marcus.query(api.home.dashboard, { seasonId, today: TODAY })).toBeNull();
  expect(
    await marcus.query(api.chainPlans.get, {
      chainPlanId: plans.Kroger,
      today: TODAY,
    }),
  ).toBeNull();
  expect(await marcus.query(api.access.me, {})).toMatchObject({ scopes: [] });
});

test("revoking the broader grant leaves the narrower one standing", async () => {
  const { t, seasonId, promotions } = await world();
  const yolanda = t.withIdentity(YEAR_MEMBER);

  await t.mutation(internal.bootstrap.grantAccess, {
    email: YEAR_MEMBER.email,
    scope: { tier: "promotion", promotionId: promotions["Gift Sets"] },
  });
  await t.mutation(internal.bootstrap.revokeAccess, {
    email: YEAR_MEMBER.email,
    scope: { tier: "season", seasonId },
  });

  expect(
    await yolanda.query(api.promotions.get, {
      promotionId: promotions["Gift Sets"],
      today: TODAY,
    }),
  ).not.toBeNull();
  expect(await yolanda.query(api.seasons.overview, { seasonId, today: TODAY })).toBeNull();
  expect(
    await yolanda.query(api.promotions.get, {
      promotionId: promotions["Holiday Endcap"],
      today: TODAY,
    }),
  ).toBeNull();
});

// --- Denied is deleted ----------------------------------------------------

test("an out-of-scope record and a deleted one produce identical responses", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const priya = t.withIdentity(PROMO_MEMBER);
  const as = t.withIdentity(ADMIN);

  const sibling = promotions["Spring Rosé"];
  const outOfScope = {
    promotion: bytes(
      await priya.query(api.promotions.get, { promotionId: sibling, today: TODAY }),
    ),
    kpi: bytes(await priya.query(api.kpi.board, { promotionId: sibling })),
    context: bytes(await priya.query(api.seasons.contextFor, { promotionId: sibling })),
    plan: bytes(
      await priya.query(api.chainPlans.get, {
        chainPlanId: plans.Kroger,
        today: TODAY,
      }),
    ),
    season: bytes(await priya.query(api.seasons.overview, { seasonId, today: TODAY })),
  };

  // Now genuinely delete the things they could not see.
  await as.mutation(api.promotions.remove, { promotionId: sibling });
  await as.mutation(api.promotions.remove, {
    promotionId: promotions["Holiday Endcap"],
  });
  await as.mutation(api.chainPlans.remove, { chainPlanId: plans.Kroger });

  const deleted = {
    promotion: bytes(
      await priya.query(api.promotions.get, { promotionId: sibling, today: TODAY }),
    ),
    kpi: bytes(await priya.query(api.kpi.board, { promotionId: sibling })),
    context: bytes(await priya.query(api.seasons.contextFor, { promotionId: sibling })),
    plan: bytes(
      await priya.query(api.chainPlans.get, {
        chainPlanId: plans.Kroger,
        today: TODAY,
      }),
    ),
    season: bytes(await priya.query(api.seasons.overview, { seasonId, today: TODAY })),
  };

  expect(deleted).toEqual(outOfScope);
});

test("a forged identifier reads exactly like an out-of-scope one", async () => {
  const { t, seasonId, promotions } = await world();
  const priya = t.withIdentity(PROMO_MEMBER);

  // A hand-edited hash, an id for the wrong table, and a real id they may not
  // have: three ways to probe, one answer.
  const answers = await Promise.all(
    [promotions["Spring Rosé"], "not-an-id-at-all", seasonId].map(
      async (promotionId) =>
        bytes(await priya.query(api.promotions.get, { promotionId, today: TODAY })),
    ),
  );

  expect(new Set(answers).size).toBe(1);
  expect(answers[0]).toBe("null");
});

test("an Administrator's own dead link answers the same null", async () => {
  // The screen a denied Member sees is the screen everyone sees for a record
  // that is gone, which is what makes it say nothing.
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const doomed = promotions["Spring Rosé"];

  await as.mutation(api.promotions.remove, { promotionId: doomed });

  expect(bytes(await as.query(api.promotions.get, { promotionId: doomed, today: TODAY })))
    .toBe(
      bytes(
        await t
          .withIdentity(PROMO_MEMBER)
          .query(api.promotions.get, { promotionId: doomed, today: TODAY }),
      ),
    );
});

// --- Aggregates -----------------------------------------------------------

test("a Member's dashboard equals an Administrator's restricted to their scopes", async () => {
  const { t, seasonId, plans, promotions } = await world();

  const admin = await t
    .withIdentity(ADMIN)
    .query(api.home.dashboard, { seasonId, today: TODAY });
  const member = await t
    .withIdentity(PLAN_MEMBER)
    .query(api.home.dashboard, { seasonId, today: TODAY });

  const krogerGroup = admin?.chains.find(
    (group) => group.chainPlanId === plans.Kroger,
  );
  if (krogerGroup === undefined || krogerGroup.reach !== "full") {
    throw new Error("The Administrator should see the Kroger plan in full.");
  }

  // Three tasks on the plan plus three on its promotion, and the same three
  // states in the same proportions — the Member's numbers are the
  // Administrator's numbers over the same rows, not a smaller sample of them.
  expect(member?.rollup).toEqual({
    total: 6,
    delivered: 0,
    inProgress: 0,
    blocked: 2,
    notStarted: 4,
    overdue: 2,
    unassigned: 2,
    missingAccountable: 6,
  });
  expect(member?.chains).toHaveLength(1);
  expect(member?.chains[0]).toMatchObject({
    reach: "full",
    chainPlanId: plans.Kroger,
    rollup: krogerGroup.rollup,
    phases: krogerGroup.phases,
  });

  // The rail is the same rows the Administrator sees, minus everything the
  // Member cannot open — no teasers, no counts that do not add up.
  const inScope = (list: NonNullable<typeof admin>["attention"]["blocked"]) =>
    list
      .filter(
        (entry) =>
          (entry.place.tier === "chainPlan" &&
            entry.place.chainPlanId === plans.Kroger) ||
          (entry.place.tier === "promotion" &&
            entry.place.promotionId === promotions["Holiday Endcap"]),
      )
      .map((entry) => entry.task._id);

  for (const list of ["unassigned", "blocked", "overdue"] as const) {
    expect(member?.attention[list].map((entry) => entry.task._id)).toEqual(
      inScope(admin?.attention[list] ?? []),
    );
    expect(member?.attention[list]).toHaveLength(2);
  }
});

test("a Promotion-only Member's dashboard has no phase 0 and no plan phases", async () => {
  const { t, seasonId, plans } = await world();

  const board = await t
    .withIdentity(PROMO_MEMBER)
    .query(api.home.dashboard, { seasonId, today: TODAY });

  expect(board?.phaseZero).toBeNull();
  expect(board?.rollup.total).toBe(3);
  expect(board?.chains).toHaveLength(1);
  expect(board?.chains[0]).toMatchObject({
    reach: "context",
    chainPlanId: plans.Albertsons,
  });
  // The chain plan is a heading: no rollup, no phase track, no jbp date.
  expect(Object.keys(board?.chains[0] ?? {}).sort()).toEqual([
    "chain",
    "chainPlanId",
    "promotions",
    "reach",
  ]);
  expect(JSON.stringify(board)).not.toContain("Albertsons plan");
});

test("a person's workload counts only the tasks the viewer can see", async () => {
  const { t, carol } = await world();

  const forAdmin = await t
    .withIdentity(ADMIN)
    .query(api.people.workload, { personId: carol, today: TODAY });
  const forMarcus = await t
    .withIdentity(PLAN_MEMBER)
    .query(api.people.workload, { personId: carol, today: TODAY });

  // Seven checklists — the year, three plans, three promotions — and Carol is
  // Responsible on two rows of each.
  expect(forAdmin?.tasks).toHaveLength(14);
  // Marcus can see the Kroger plan's and the Kroger promotion's.
  expect(forMarcus?.tasks).toHaveLength(4);
  expect(JSON.stringify(forMarcus)).not.toContain("Gift Sets");

  const load = async (who: typeof ADMIN) => {
    const directory = await t
      .withIdentity(who)
      .query(api.people.directory, { today: TODAY });
    return directory[0].people[0].load;
  };
  expect(await load(ADMIN)).toMatchObject({ responsible: 14, blocked: 7, overdue: 7 });
  expect(await load(PLAN_MEMBER)).toMatchObject({
    responsible: 4,
    blocked: 2,
    overdue: 2,
  });
  // The person is still in the directory for everyone — a picker that hid her
  // would make somebody name the wrong owner (#22).
  expect(await load(NEWCOMER)).toMatchObject({ responsible: 0, blocked: 0, overdue: 0 });
  expect(await t.withIdentity(NEWCOMER).query(api.people.list, {})).toHaveLength(1);
});

test("the plan year list holds only years the viewer can reach", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.seasons.create, { year: 2027, notes: "Next year's outline" });

  expect(await as.query(api.seasons.list, {})).toMatchObject([
    { year: 2027, reach: "full" },
    { year: 2026, reach: "full" },
  ]);
  // Priya's grant is a promotion in 2026: one year, as a name only, and 2027
  // is not on the list at all.
  const priya = await t.withIdentity(PROMO_MEMBER).query(api.seasons.list, {});
  expect(priya).toMatchObject([{ year: 2026, reach: "context" }]);
  expect(priya[0].notes).toBeUndefined();
});

// --- The Administrator's world is unchanged -------------------------------

test("an Administrator still reads the whole tree", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const as = t.withIdentity(ADMIN);

  const tree = await as.query(api.seasons.tree, { seasonId, today: TODAY });
  expect(tree?.reach).toBe("full");
  expect(tree?.seasonRollup?.total).toBe(3);
  expect(tree?.chains).toHaveLength(3);

  const board = await as.query(api.home.dashboard, { seasonId, today: TODAY });
  // Seven checklists of three, one of each three unowned, stuck and late.
  expect(board?.rollup).toMatchObject({
    total: 21,
    unassigned: 7,
    blocked: 7,
    overdue: 7,
  });
  expect(board?.phaseZero?.rollup.total).toBe(3);

  const results = await reads(as, {
    seasonId,
    chainPlanId: plans.Kroger,
    promotionId: promotions["Gift Sets"],
  });
  expect(Object.values(results).some((value) => value === "refused")).toBe(false);
});
