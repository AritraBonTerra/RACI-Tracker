import { expect, test } from "vitest";
import { internal } from "./_generated/api";
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
