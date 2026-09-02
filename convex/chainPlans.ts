import { ConvexError, v } from "convex/values";
import {
  adminMutation,
  authedMutation,
  authedQuery,
  editorsOf,
  readableChainPlan,
  writableChainPlan,
  writableSeason,
} from "./access";
import {
  CHAIN_PLAN_PHASES,
  chainLabel,
  chainPlanPhase,
  deleteTasks,
  mustGet,
  optionalText,
  patched,
  patchedText,
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
      // A name, not the record: the chain's notes are Administrator material.
      chain: chainLabel(chain),
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
      editors: await editorsOf(ctx, [plan, ...tasks]),
    };
  },
});

/** Starting a plan under a year is an Administrator's alone (#22, story 29). */
export const create = adminMutation({
  args: {
    seasonId: v.id("seasons"),
    chainId: v.id("chains"),
    currentPhase: v.optional(chainPlanPhase),
    jbpDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The parent is loaded and asked, the same way a Member's task create is.
    await writableSeason(ctx, ctx.scope, args.seasonId);
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
      ...ctx.stamp,
    });
    await stampTemplates(ctx, { tier: "chainPlan", chainPlanId }, CHAIN_PLAN_PHASES, ctx.stamp);
    return chainPlanId;
  },
});

/**
 * Keeping the plan's own fields current, for anyone whose scope covers it.
 * Every field keeps its current value unless sent (model.ts: patched).
 */
export const update = authedMutation({
  args: {
    chainPlanId: v.id("chainPlans"),
    currentPhase: v.optional(chainPlanPhase),
    jbpDate: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const plan = await writableChainPlan(ctx, ctx.scope, args.chainPlanId);
    await ctx.db.patch(plan._id, {
      ...ctx.stamp,
      currentPhase: patched(args.currentPhase, plan.currentPhase),
      jbpDate: patchedText(args.jbpDate, plan.jbpDate),
      notes: patchedText(args.notes, plan.notes),
    });
  },
});

/** Takes the plan's own checklist with it, but refuses while promotions exist. */
export const remove = adminMutation({
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
