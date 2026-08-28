import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { authedQuery, readableChainPlan } from "./access";
import { phase } from "./schema";
import {
  CHAIN_PLAN_PHASES,
  deleteTasks,
  mustGet,
  optionalText,
  raciDefaults,
  rollup,
  stampTemplates,
} from "./model";

// The middle tier: one chain x one plan year, carrying phases 1-4 (internal
// alignment -> distributor alignment -> JBP & negotiation -> agreement).

/**
 * The chain plan page: its 1-4 checklist plus the promotions hanging off it.
 * Null when the id no longer resolves, and null in exactly the same way when
 * the viewer's scope does not reach it — a denied link never confirms that
 * something is there to be denied.
 *
 * The plan year comes back as a name and a reach, never as content: a Member
 * granted this plan gets "2026" for orientation and no way into phase 0.
 */
export const get = authedQuery({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { chainPlanId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const plan = await readableChainPlan(ctx, ctx.scope, args.chainPlanId);
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
        // A Promotion under a granted Chain Plan is always in scope; the filter
        // matters when the plan itself was reached through a Season grant that
        // someone later narrowed.
        .filter((promotion) => ctx.scope.promotion(promotion) === "full")
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
      season: {
        _id: season._id,
        year: season.year,
        label: season.label,
        reach: ctx.scope.season(season._id),
      },
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
      throw new ConvexError(`${chain.name} already has a plan for this year.`);
    }

    const chainPlanId = await ctx.db.insert("chainPlans", {
      seasonId: args.seasonId,
      chainId: args.chainId,
      currentPhase: args.currentPhase ?? 1,
      jbpDate: optionalText(args.jbpDate),
      notes: optionalText(args.notes),
    });
    await stampTemplates(ctx, { tier: "chainPlan", chainPlanId }, CHAIN_PLAN_PHASES);
    return chainPlanId;
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
