import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { harness } from "./world.fixture";

// The production loader for the strategic-accounts world. Run against the demo
// seed's reference data (Functions and Task Templates), which is what
// production carries after the 2026-09-14 demo-content clear.

test("seed2026 opens every chain's plan, pre-delivered, and is idempotent across batches", async () => {
  const t = harness();
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.migrations.clearDemoContent, {});

  const first = await t.mutation(internal.strategicAccounts.seed2026, { batch: 10 });
  expect(first).toMatchObject({
    peopleCreated: 8,
    chainsCreated: 53,
    seasonCreated: true,
    seasonTasksAdopted: 0,
  });
  expect(first.plansCreated).toBe(10);
  expect(first.remaining).toBe(43);

  // Resumable: later calls only open what is still missing.
  let last = first;
  while (last.remaining > 0) {
    last = await t.mutation(internal.strategicAccounts.seed2026, { batch: 20 });
    expect(last).toMatchObject({ peopleCreated: 0, chainsCreated: 0, seasonCreated: false });
  }
  const again = await t.mutation(internal.strategicAccounts.seed2026, {});
  expect(again).toEqual({
    peopleCreated: 0,
    chainsCreated: 0,
    seasonCreated: false,
    seasonTasksAdopted: 0,
    plansCreated: 0,
    plansConverged: 0,
    planTasksAdopted: 0,
    remaining: 0,
  });

  await t.run(async (ctx) => {
    const plans = await ctx.db.query("chainPlans").collect();
    expect(plans).toHaveLength(53);
    expect(plans.every((plan) => plan.currentPhase === 3)).toBe(true);

    const placeholder = (await ctx.db.query("people").collect()).find(
      (person) => person.name === "Admin (placeholder)",
    );
    if (placeholder === undefined) throw new Error("Missing placeholder");

    const tasks = await ctx.db.query("tasks").collect();
    const templates = await ctx.db.query("taskTemplates").collect();
    const perPlan = templates.filter((row) => row.phase >= 1 && row.phase <= 3).length;
    const phaseZero = templates.filter((row) => row.phase === 0).length;
    expect(tasks).toHaveLength(phaseZero + 53 * perPlan);
    expect(
      tasks.every(
        (task) =>
          task.status === "delivered" &&
          task.accountablePersonId === placeholder._id &&
          task.responsiblePersonIds?.length === 1 &&
          task.responsiblePersonIds[0] === placeholder._id,
      ),
    ).toBe(true);

    const kroger = (await ctx.db.query("chains").collect()).find((c) => c.name === "Kroger");
    expect(kroger?.notes).toBe("Strategic account manager: Adam Szabo");
  });
});

test("seed2026 adopts unowned phase-0 work of a year opened in the app first", async () => {
  const t = harness();
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.migrations.clearDemoContent, {});

  // The year already exists, its checklist stamped and untouched — as it is
  // when an Administrator clicked "+ New year" before the loader ran.
  const seasonId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("seasons", { year: 2026, label: "2026" });
    const templates = (await ctx.db.query("taskTemplates").collect()).filter((r) => r.phase === 0);
    for (const [order, template] of templates.entries()) {
      await ctx.db.insert("tasks", {
        seasonId: id,
        phase: 0,
        name: template.name,
        spec: template.spec,
        category: template.category,
        quantity: template.quantity,
        status: "not_started",
        responsiblePersonIds: [],
        consultedPersonIds: [],
        informedPersonIds: [],
        order,
      });
    }
    return id;
  });

  const result = await t.mutation(internal.strategicAccounts.seed2026, { batch: 60 });
  expect(result).toMatchObject({ seasonCreated: false, seasonTasksAdopted: 8, remaining: 0 });

  await t.run(async (ctx) => {
    const placeholder = (await ctx.db.query("people").collect()).find(
      (person) => person.name === "Admin (placeholder)",
    );
    const phaseZero = await ctx.db
      .query("tasks")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .collect();
    expect(phaseZero).toHaveLength(8);
    expect(
      phaseZero.every(
        (task) =>
          task.status === "delivered" &&
          task.accountablePersonId === placeholder?._id &&
          task.responsiblePersonIds?.[0] === placeholder?._id,
      ),
    ).toBe(true);
  });
});

test("seed2026 converges a plan an Editor opened in the app first, keeping owned work", async () => {
  const t = harness();
  await t.mutation(internal.seed.run, {});
  await t.mutation(internal.migrations.clearDemoContent, {});

  // Kroger's 2026 plan already exists at phase 1 with its checklist stamped —
  // as it is when a chain Editor clicked "start one here" before the loader
  // ran. One row is somebody's, one is blocked without an owner, one only has
  // someone Consulted, and one was added by hand: none of those are adopted.
  const { chainPlanId, keptTaskIds } = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { year: 2026, label: "2026" });
    const chainId = await ctx.db.insert("chains", { name: "Kroger" });
    const chainPlanId = await ctx.db.insert("chainPlans", { seasonId, chainId, currentPhase: 1 });
    const fn = await ctx.db.query("functions").first();
    if (fn === null) throw new Error("No functions");
    const someone = await ctx.db.insert("people", { name: "Someone Real", functionId: fn._id });
    const templates = (await ctx.db.query("taskTemplates").collect()).filter(
      (r) => r.phase >= 1 && r.phase <= 3,
    );
    const keptTaskIds: Id<"tasks">[] = [];
    for (const [order, template] of templates.entries()) {
      const id = await ctx.db.insert("tasks", {
        chainPlanId,
        phase: template.phase,
        name: template.name,
        spec: template.spec,
        category: template.category,
        quantity: template.quantity,
        status: order === 0 ? "in_progress" : order === 1 ? "blocked" : "not_started",
        blockedReason: order === 1 ? "Waiting on the buyer" : undefined,
        responsiblePersonIds: order === 0 ? [someone] : [],
        consultedPersonIds: order === 2 ? [someone] : [],
        informedPersonIds: [],
        order,
        lastModifiedAt: 1,
      });
      if (order <= 2) keptTaskIds.push(id);
    }
    keptTaskIds.push(
      await ctx.db.insert("tasks", {
        chainPlanId,
        phase: 2,
        name: "Buyer lunch",
        status: "not_started",
        responsiblePersonIds: [],
        consultedPersonIds: [],
        informedPersonIds: [],
        order: templates.length,
        lastModifiedAt: 1,
      }),
    );
    if (keptTaskIds.length !== 4) throw new Error("Not enough templates");
    return { chainPlanId, keptTaskIds };
  });

  // Convergence is a unit of work like opening a plan: a zero batch does none.
  expect(await t.mutation(internal.strategicAccounts.seed2026, { batch: 0 })).toMatchObject({
    plansCreated: 0,
    plansConverged: 0,
    planTasksAdopted: 0,
    remaining: 53,
  });

  const result = await t.mutation(internal.strategicAccounts.seed2026, { batch: 60 });
  const perPlan = await t.run(
    async (ctx) =>
      (await ctx.db.query("taskTemplates").collect()).filter((r) => r.phase >= 1 && r.phase <= 3)
        .length,
  );
  expect(result).toMatchObject({
    seasonCreated: false,
    plansCreated: 52,
    plansConverged: 1,
    planTasksAdopted: perPlan - 3,
    remaining: 0,
  });

  // Idempotent: a second pass finds nothing left to adopt.
  expect(await t.mutation(internal.strategicAccounts.seed2026, {})).toMatchObject({
    plansCreated: 0,
    plansConverged: 0,
    planTasksAdopted: 0,
    remaining: 0,
  });

  await t.run(async (ctx) => {
    expect((await ctx.db.get(chainPlanId))?.currentPhase).toBe(3);
    for (const id of keptTaskIds) {
      const kept = await ctx.db.get(id);
      expect(kept?.status).not.toBe("delivered");
      expect(kept?.accountablePersonId).toBeUndefined();
      expect(kept?.lastModifiedAt).toBe(1);
    }
    const placeholder = (await ctx.db.query("people").collect()).find(
      (person) => person.name === "Admin (placeholder)",
    );
    const rest = (
      await ctx.db
        .query("tasks")
        .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", chainPlanId))
        .collect()
    ).filter((task) => !keptTaskIds.includes(task._id));
    expect(rest).toHaveLength(perPlan - 3);
    expect(
      rest.every(
        (task) =>
          task.status === "delivered" &&
          task.accountablePersonId === placeholder?._id &&
          task.lastModifiedAt === undefined,
      ),
    ).toBe(true);
  });
});
