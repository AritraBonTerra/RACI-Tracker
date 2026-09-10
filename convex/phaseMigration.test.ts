import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./world.fixture";

// Read the old numeric values even after the deployed schema disallows phase 8.
const legacySchema = defineSchema({
  ...schema.tables,
  tasks: defineTable({ ...schema.tables.tasks.validator.fields, phase: v.number() }),
  taskTemplates: defineTable({
    ...schema.tables.taskTemplates.validator.fields,
    phase: v.number(),
  }),
  promotions: defineTable({
    ...schema.tables.promotions.validator.fields,
    currentPhase: v.number(),
  }),
  chainPlans: defineTable({
    ...schema.tables.chainPlans.validator.fields,
    currentPhase: v.number(),
  }),
  phaseRaciDefaults: defineTable({
    ...schema.tables.phaseRaciDefaults.validator.fields,
    phase: v.number(),
  }),
});

test("eight-phase migration preserves work, merges agreement and cannot run twice", async () => {
  const t = convexTest(legacySchema, modules);
  const ids = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { year: 2026, label: "2026" });
    const chainId = await ctx.db.insert("chains", { name: "Account" });
    const chainPlanId = await ctx.db.insert("chainPlans", { seasonId, chainId, currentPhase: 4 });
    const promotionId = await ctx.db.insert("promotions", {
      seasonId,
      chainId,
      chainPlanId,
      currentPhase: 8,
      name: "Existing program",
      brandIds: [],
      startDate: "2026-01-01",
      endDate: "2026-02-01",
    });
    const functionId = await ctx.db.insert("functions", {
      key: "sales",
      name: "Sales",
      kind: "internal",
      order: 0,
    });
    const personId = await ctx.db.insert("people", { name: "Owner", functionId });
    for (const phase of [3, 4, 5, 6, 7, 8]) {
      await ctx.db.insert("tasks", {
        ...(phase <= 4 ? { chainPlanId } : { promotionId }),
        phase,
        order: 0,
        name: `Old ${phase}`,
        status: "delivered",
        responsiblePersonIds: [personId],
        accountablePersonId: personId,
        consultedPersonIds: [],
        informedPersonIds: [],
        eta: "2026-01-01",
        notes: "Keep notes",
      });
      await ctx.db.insert("taskTemplates", { phase, order: 0, name: `Template ${phase}` });
    }
    await ctx.db.insert("phaseRaciDefaults", {
      phase: 3,
      functionId,
      roles: ["responsible"],
      note: "Negotiation",
    });
    await ctx.db.insert("phaseRaciDefaults", {
      phase: 4,
      functionId,
      roles: ["accountable"],
      note: "Agreement",
    });
    await ctx.db.insert("kpiEntries", { promotionId, metric: "investment", baseline: 50 });
    await ctx.db.insert("retros", { promotionId, worked: "Keep review" });
    return { chainPlanId, promotionId, personId };
  });
  expect(await t.mutation(internal.migrations.eightPhaseWorkflow, {})).toEqual({ changed: true });
  const read = () =>
    t.run(async (ctx) => ({
      tasks: await ctx.db.query("tasks").collect(),
      templates: await ctx.db.query("taskTemplates").collect(),
      plan: await ctx.db.get(ids.chainPlanId),
      promotion: await ctx.db.get(ids.promotionId),
      raci: await ctx.db.query("phaseRaciDefaults").collect(),
      kpis: await ctx.db.query("kpiEntries").collect(),
      retros: await ctx.db.query("retros").collect(),
    }));
  const after = await read();
  expect(after.tasks.map((task) => task.phase)).toEqual([3, 3, 4, 5, 6, 7]);
  expect(after.templates.map((task) => task.phase)).toEqual([3, 3, 4, 5, 6, 7]);
  expect(after.tasks.slice(0, 2).map((task) => task.order)).toEqual([0, 1]);
  expect(
    after.tasks.every(
      (task) =>
        task.status === "delivered" &&
        task.accountablePersonId === ids.personId &&
        task.notes === "Keep notes",
    ),
  ).toBe(true);
  expect(after.plan?.currentPhase).toBe(3);
  expect(after.promotion?.currentPhase).toBe(7);
  expect(after.raci).toHaveLength(1);
  expect(after.raci[0].roles).toEqual(["responsible", "accountable"]);
  expect(after.kpis[0].baseline).toBe(50);
  expect(after.retros[0].worked).toBe("Keep review");
  expect(await t.mutation(internal.migrations.eightPhaseWorkflow, {})).toEqual({ changed: false });
  expect(await read()).toEqual(after);
});
