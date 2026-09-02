import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import {
  byEta,
  CHAIN_PLAN_PHASES,
  fromUrl,
  isOverdue,
  type PhaseNumber,
  PROMOTION_PHASES,
  placeResolver,
  responsiblesOf,
  rollup,
  SEASON_PHASES,
  type TaskPlace,
} from "./model";

// The dashboard: every promotion in the season grouped by chain, and the three
// lists that decide whether the cycle is actually under control — work with no
// named Responsible, work that is blocked, work that is late. One query, because
// the point of the screen is that all of it is visible at once.

type Attention = { task: Doc<"tasks">; place: TaskPlace };

/** Delivered-vs-total per phase, so a promotion can be drawn as a progress track. */
function phaseTrack(tasks: readonly Doc<"tasks">[], phases: readonly PhaseNumber[], today: string) {
  return phases.map((value) => ({
    phase: value,
    ...rollup(
      tasks.filter((task) => task.phase === value),
      today,
    ),
  }));
}

export const dashboard = query({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { seasonId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const season = await fromUrl(ctx, "seasons", args.seasonId);
    if (season === null) return null;

    const placeOf = placeResolver(ctx);
    // Every task in the season, kept so the headline counts and the rail are
    // computed from exactly the same rows the cards are.
    const all: Doc<"tasks">[] = [];

    const seasonTasks = await ctx.db
      .query("tasks")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();
    all.push(...seasonTasks);

    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const chains = await ctx.db.query("chains").collect();
    const chainById = new Map(chains.map((chain) => [chain._id, chain]));

    const chainGroups = await Promise.all(
      plans.map(async (plan) => {
        const planTasks = await ctx.db
          .query("tasks")
          .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
          .collect();
        all.push(...planTasks);

        const promotions = await ctx.db
          .query("promotions")
          .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
          .collect();

        const promotionCards = await Promise.all(
          promotions
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map(async (promotion) => {
              const tasks = await ctx.db
                .query("tasks")
                .withIndex("by_promotion", (q) => q.eq("promotionId", promotion._id))
                .collect();
              all.push(...tasks);

              return {
                promotion,
                rollup: rollup(tasks, args.today),
                phases: phaseTrack(tasks, PROMOTION_PHASES, args.today),
              };
            }),
        );

        return {
          chain: chainById.get(plan.chainId) ?? null,
          plan,
          rollup: rollup(planTasks, args.today),
          phases: phaseTrack(planTasks, CHAIN_PLAN_PHASES, args.today),
          promotions: promotionCards,
        };
      }),
    );

    // A promotion in market outranks one still being planned, and a chain with
    // no promotions yet (Kroger, mid-cycle) sorts last rather than disappearing.
    chainGroups.sort((a, b) => {
      const byPromotions = b.promotions.length - a.promotions.length;
      if (byPromotions !== 0) return byPromotions;
      return (a.chain?.name ?? "").localeCompare(b.chain?.name ?? "");
    });

    const sorted = [...all].sort(byEta);
    const withPlace = async (tasks: readonly Doc<"tasks">[]): Promise<Attention[]> =>
      await Promise.all(tasks.map(async (task) => ({ task, place: await placeOf(task) })));

    return {
      season,
      rollup: rollup(all, args.today),
      seasonRollup: rollup(seasonTasks, args.today),
      seasonPhases: phaseTrack(seasonTasks, SEASON_PHASES, args.today),
      chains: chainGroups,
      attention: {
        // The red list: no named Responsible, so nobody is doing the work.
        unassigned: await withPlace(sorted.filter((task) => responsiblesOf(task).length === 0)),
        blocked: await withPlace(sorted.filter((task) => task.status === "blocked")),
        overdue: await withPlace(sorted.filter((task) => isOverdue(task, args.today))),
      },
    };
  },
});
