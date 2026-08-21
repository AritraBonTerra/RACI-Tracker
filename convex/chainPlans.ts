import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { phase } from "./schema";
import {
  CHAIN_PLAN_PHASES,
  deleteTasks,
  mustGet,
  optionalText,
  raciDefaults,
  rollup,
} from "./model";

// The middle tier: one chain x one season, carrying phases 1-4 (internal
// alignment -> distributor alignment -> JBP & negotiation -> agreement).

/**
 * The chain plan page: its 1-4 checklist plus the promotions hanging off it.
 * Null when the id no longer resolves — a deleted plan is a message, not a crash.
 */
export const get = query({
  args: { chainPlanId: v.id("chainPlans"), today: v.string() },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.chainPlanId);
    if (plan === null) return null;
    const chain = await mustGet(ctx, plan.chainId, "chain");
    const season = await mustGet(ctx, plan.seasonId, "season");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
      .collect();

    const promotions = await ctx.db
      .query("promotions")
      .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
      .collect();

    const promotionCards = await Promise.all(
      promotions
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map(async (promotion) => ({
          promotion,
          rollup: rollup(
            await ctx.db
              .query("tasks")
              .withIndex("by_promotion", (q) => q.eq("promotionId", promotion._id))
              .collect(),
            args.today,
          ),
        })),
    );

    return {
      plan,
      chain,
      season,
      tasks: tasks.sort((a, b) => a.order - b.order),
      rollup: rollup(tasks, args.today),
      promotions: promotionCards,
      raciDefaults: await raciDefaults(ctx, CHAIN_PLAN_PHASES),
    };
  },
});

export const create = mutation({
  args: {
    seasonId: v.id("seasons"),
    chainId: v.id("chains"),
    currentPhase: v.optional(phase),
    jbpDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.seasonId, "season");
    const chain = await mustGet(ctx, args.chainId, "chain");

    // A chain plan is one chain x one season by definition.
    const existing = await ctx.db
      .query("chainPlans")
      .withIndex("by_season_and_chain", (q) =>
        q.eq("seasonId", args.seasonId).eq("chainId", args.chainId),
      )
      .first();
    if (existing !== null) {
      throw new ConvexError(`${chain.name} already has a plan for this season.`);
    }

    return await ctx.db.insert("chainPlans", {
      seasonId: args.seasonId,
      chainId: args.chainId,
      currentPhase: args.currentPhase ?? 1,
      jbpDate: optionalText(args.jbpDate),
      notes: optionalText(args.notes),
    });
  },
});

export const update = mutation({
  args: {
    chainPlanId: v.id("chainPlans"),
    currentPhase: v.optional(phase),
    jbpDate: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.chainPlanId, "chain plan");
    await ctx.db.patch(args.chainPlanId, {
      ...(args.currentPhase === undefined ? {} : { currentPhase: args.currentPhase }),
      ...(args.jbpDate === undefined ? {} : { jbpDate: optionalText(args.jbpDate) }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

/** Takes the plan's own checklist with it, but refuses while promotions exist. */
export const remove = mutation({
  args: { chainPlanId: v.id("chainPlans") },
  handler: async (ctx, args) => {
    const promotions = await ctx.db
      .query("promotions")
      .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", args.chainPlanId))
      .collect();
    if (promotions.length > 0) {
      throw new ConvexError(
        `This plan still has ${promotions.length} promotion(s). Delete those first.`,
      );
    }

    await deleteTasks(
      ctx,
      await ctx.db
        .query("tasks")
        .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", args.chainPlanId))
        .collect(),
    );
    await ctx.db.delete(args.chainPlanId);
  },
});
