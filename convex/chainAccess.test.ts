import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { ADMIN, NEWCOMER, TODAY, world } from "./world.fixture";

async function setup() {
  const w = await world();
  const admin = w.t.withIdentity(ADMIN);
  const owner = w.t.withIdentity(NEWCOMER);
  const me = await owner.query(api.access.me, {});
  if (me.state !== "active") throw new Error("Missing account");
  const userId = me.account.id;
  const chains = await admin.query(api.chains.list, {});
  const chain = chains.find((chain) => chain.name === "Kroger");
  if (chain === undefined) throw new Error("Missing Kroger");
  const chainId = chain._id;
  const scope = { tier: "chain" as const, chainId };
  return { ...w, admin, owner, userId, chainId, scope };
}

test("chain Viewer dashboard includes only assigned chains and matches plan-scoped totals", async () => {
  const { admin, owner, userId, scope, seasonId, plans, promotions } = await setup();
  await admin.mutation(api.directory.setRole, { userId, role: "viewer" });
  await admin.mutation(api.directory.grant, { userId, scope });
  const dashboard = await owner.query(api.home.dashboard, { seasonId, today: TODAY });
  expect(dashboard?.chains.map((chain) => chain.chain?.name)).toEqual(["Kroger"]);
  expect(dashboard?.phaseZero).toBeNull();
  expect(dashboard?.rollup).toMatchObject({ total: 6, blocked: 2, overdue: 2, unassigned: 2 });
  expect(dashboard?.attention.overdue).toHaveLength(2);
  expect(
    await owner.query(api.chainPlans.get, { chainPlanId: plans.Albertsons, today: TODAY }),
  ).toBeNull();
  expect(
    await owner.query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: TODAY }),
  ).toBeNull();
  expect(await owner.query(api.kpi.board, { promotionId: promotions["Gift Sets"] })).toBeNull();
  expect(
    await owner.query(api.kpi.board, { promotionId: promotions["Holiday Endcap"] }),
  ).not.toBeNull();
  await expect(
    owner.mutation(api.chainPlans.update, { chainPlanId: plans.Kroger, notes: "No" }),
  ).rejects.toThrow();
  await expect(owner.mutation(api.directory.grant, { userId, scope })).rejects.toThrow();
  const preview = await admin.query(api.directory.effectiveAccess, { userId });
  expect(preview[0].reach).toBe("context");
  expect(
    preview[0].plans.filter((plan) => plan.reach === "full").map((plan) => plan.chainPlanId),
  ).toEqual([plans.Kroger]);
});

test("chain grants include future plans and promotions without exposing year work", async () => {
  const { admin, owner, userId, scope, chainId } = await setup();
  await admin.mutation(api.directory.grant, { userId, scope });
  const seasonId = await admin.mutation(api.seasons.create, { year: 2027 });
  const chainPlanId = await admin.mutation(api.chainPlans.create, { seasonId, chainId });
  const promotionId = await admin.mutation(api.promotions.create, {
    chainPlanId,
    name: "Future launch",
    startDate: "2027-01-01",
    endDate: "2027-02-01",
  });
  expect(await owner.query(api.promotions.get, { promotionId, today: TODAY })).not.toBeNull();
  expect(await owner.query(api.seasons.overview, { seasonId, today: TODAY })).toBeNull();
  const taskId = await owner.mutation(api.tasks.create, {
    owner: { tier: "promotion", promotionId },
    phase: 6,
    name: "Future task",
  });
  await owner.mutation(api.tasks.setStatus, { taskId, status: "delivered" });
  const dashboard = await owner.query(api.home.dashboard, { seasonId, today: TODAY });
  expect(dashboard?.rollup.delivered).toBe(1);
  await expect(owner.mutation(api.seasons.update, { seasonId, notes: "No" })).rejects.toThrow();
});

test("chain grants are idempotent and revocation preserves only overlapping grants", async () => {
  const { admin, owner, userId, scope, seasonId, plans, promotions } = await setup();
  expect(await admin.mutation(api.directory.grant, { userId, scope })).toBe(true);
  expect(await admin.mutation(api.directory.grant, { userId, scope })).toBe(false);
  const promotionId = promotions["Holiday Endcap"];
  await admin.mutation(api.directory.grant, { userId, scope: { tier: "promotion", promotionId } });
  await admin.mutation(api.directory.revoke, { userId, scope });
  expect(
    await owner.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
  ).toBeNull();
  expect((await owner.query(api.home.dashboard, { seasonId, today: TODAY }))?.rollup.total).toBe(3);
  await admin.mutation(api.directory.revoke, { userId, scope: { tier: "promotion", promotionId } });
  expect(await owner.query(api.home.dashboard, { seasonId, today: TODAY })).toBeNull();
  const events = await admin.query(api.directory.auditFeed, { userId });
  expect(events.filter((event) => event.action === "access_granted")).toHaveLength(2);
  expect(events.some((event) => event.detail?.includes("Kroger · all plan years"))).toBe(true);
});

test("multiple chain grants form a union and deleted chain grants grant nothing", async () => {
  const { admin, owner, userId, scope, seasonId } = await setup();
  const chainId = await admin.mutation(api.chains.create, { name: "ABC Liquors" });
  const second = { tier: "chain" as const, chainId };
  await admin.mutation(api.directory.grant, { userId, scope: second });
  expect((await owner.query(api.access.me, {})).state).toBe("active");
  expect(await owner.query(api.seasons.list, {})).toEqual([]);
  const chainPlanId = await admin.mutation(api.chainPlans.create, { seasonId, chainId });
  await admin.mutation(api.directory.grant, { userId, scope });
  expect((await owner.query(api.home.dashboard, { seasonId, today: TODAY }))?.chains).toHaveLength(
    2,
  );
  await admin.mutation(api.chainPlans.remove, { chainPlanId });
  await admin.mutation(api.chains.remove, { chainId });
  expect((await admin.query(api.directory.account, { userId }))?.grants).toHaveLength(1);
  await expect(admin.mutation(api.directory.grant, { userId, scope: second })).rejects.toThrow();
});
