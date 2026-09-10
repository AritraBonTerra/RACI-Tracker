import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { DEFAULT_TASK_TEMPLATES } from "./templateDefaults";
import { ADMIN, TODAY, world } from "./world.fixture";

test("approved templates stamp the correct tiers without assigning departments as people", async () => {
  const { t, plans } = await world();
  const admin = t.withIdentity(ADMIN);
  const before = await admin.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY });
  expect(await admin.mutation(api.taskTemplates.loadDefaults, {})).toEqual({ inserted: 62 });
  const templates = await admin.query(api.taskTemplates.list, {});
  expect(
    Array.from({ length: 8 }, (_, phase) => templates.filter((row) => row.phase === phase).length),
  ).toEqual([8, 8, 8, 12, 7, 7, 6, 6]);
  expect(new Set(templates.map((row) => row.name)).size).toBe(62);
  const seasonId = await admin.mutation(api.seasons.create, { year: 2027 });
  const chainId = await admin.mutation(api.chains.create, { name: "New account" });
  const chainPlanId = await admin.mutation(api.chainPlans.create, { seasonId, chainId });
  const promotionId = await admin.mutation(api.promotions.create, {
    chainPlanId,
    name: "New program",
    startDate: "2027-01-01",
    endDate: "2027-02-01",
  });
  const year = await admin.query(api.seasons.overview, { seasonId, today: TODAY });
  const plan = await admin.query(api.chainPlans.get, { chainPlanId, today: TODAY });
  const promotion = await admin.query(api.promotions.get, { promotionId, today: TODAY });
  const tasks = [...(year?.tasks ?? []), ...(plan?.tasks ?? []), ...(promotion?.tasks ?? [])];
  expect(tasks).toHaveLength(62);
  expect(tasks.map(({ phase, name, spec }) => ({ phase, name, spec }))).toEqual(
    DEFAULT_TASK_TEMPLATES,
  );
  expect(
    tasks.every((task) => task.responsiblePersonIds?.length === 0 && task.status === "not_started"),
  ).toBe(true);
  expect(
    await admin.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
  ).toEqual(before);
});

test("new work accepts activation phase 4 on promotions and rejects retired phase 8", async () => {
  const { t, plans } = await world();
  const admin = t.withIdentity(ADMIN);
  const promotionId = await admin.mutation(api.promotions.create, {
    chainPlanId: plans.Kroger,
    name: "Activation",
    startDate: "2027-01-01",
    endDate: "2027-02-01",
    currentPhase: 4,
  });
  expect(
    (await admin.query(api.promotions.get, { promotionId, today: TODAY }))?.promotion.currentPhase,
  ).toBe(4);
  await expect(
    admin.mutation(api.taskTemplates.create, {
      // @ts-expect-error phase 8 was retired
      phase: 8,
      name: "Old phase",
    }),
  ).rejects.toThrow();
  await expect(
    admin.mutation(api.chainPlans.update, {
      chainPlanId: plans.Kroger,
      // @ts-expect-error activation is promotion work
      currentPhase: 4,
    }),
  ).rejects.toThrow();
});
