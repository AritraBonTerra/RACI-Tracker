import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  SEASON_PHASES,
  deleteTasks,
  mustGet,
  optionalText,
  raciDefaults,
  requiredText,
  rollup,
} from "./model";

// The top tier: a planning year and its phase-0 checklist, plus the navigation
// tree (season -> chain plans -> promotions) that the whole UI hangs off.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const seasons = await ctx.db.query("seasons").collect();
    return seasons.sort((a, b) => b.year - a.year);
  },
});

/**
 * The season page: its own phase-0 checklist. Returns null for an id that no
 * longer resolves, so a stale bookmark renders a message instead of an error.
 */
export const overview = query({
  args: { seasonId: v.id("seasons"), today: v.string() },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (season === null) return null;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    return {
      season,
      tasks: tasks.sort((a, b) => a.order - b.order),
      rollup: rollup(tasks, args.today),
      raciDefaults: await raciDefaults(ctx, SEASON_PHASES),
    };
  },
});

/**
 * The navigation tree for one season, with a health rollup on every node so the
 * sidebar can show where the trouble is without a second round trip. Chains with
 * no plan for this season are included, so a plan can be started from the tree.
 */
export const tree = query({
  args: { seasonId: v.id("seasons"), today: v.string() },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (season === null) return null;

    const seasonTasks = await ctx.db
      .query("tasks")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const chains = await ctx.db.query("chains").collect();

    const chainNodes = await Promise.all(
      chains
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (chain) => ({
          chain,
          plans: await Promise.all(
            plans
              .filter((plan) => plan.chainId === chain._id)
              .map(async (plan) => {
                const planTasks = await ctx.db
                  .query("tasks")
                  .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
                  .collect();
                const promotions = await ctx.db
                  .query("promotions")
                  .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
                  .collect();

                return {
                  plan,
                  rollup: rollup(planTasks, args.today),
                  promotions: await Promise.all(
                    promotions
                      .sort((a, b) => a.startDate.localeCompare(b.startDate))
                      .map(async (promotion) => ({
                        promotion,
                        rollup: rollup(
                          await ctx.db
                            .query("tasks")
                            .withIndex("by_promotion", (q) =>
                              q.eq("promotionId", promotion._id),
                            )
                            .collect(),
                          args.today,
                        ),
                      })),
                  ),
                };
              }),
          ),
        })),
    );

    return {
      season,
      seasonRollup: rollup(seasonTasks, args.today),
      chains: chainNodes,
    };
  },
});

/**
 * Which season a deep link belongs to. A link to a promotion has to be able to
 * draw the whole navigation tree around it, and only the backend knows which
 * season that promotion sits under.
 */
export const contextFor = query({
  args: {
    chainPlanId: v.optional(v.id("chainPlans")),
    promotionId: v.optional(v.id("promotions")),
  },
  handler: async (ctx, args) => {
    if (args.promotionId !== undefined) {
      const promotion = await ctx.db.get(args.promotionId);
      return promotion === null ? null : { seasonId: promotion.seasonId };
    }
    if (args.chainPlanId !== undefined) {
      const plan = await ctx.db.get(args.chainPlanId);
      return plan === null ? null : { seasonId: plan.seasonId };
    }
    return null;
  },
});

export const create = mutation({
  args: { year: v.number(), label: v.optional(v.string()), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (existing !== null) throw new ConvexError(`Season ${args.year} already exists.`);

    return await ctx.db.insert("seasons", {
      year: args.year,
      label: optionalText(args.label) ?? String(args.year),
      notes: optionalText(args.notes),
    });
  },
});

export const update = mutation({
  args: {
    seasonId: v.id("seasons"),
    label: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.seasonId, "season");
    await ctx.db.patch(args.seasonId, {
      ...(args.label === undefined ? {} : { label: requiredText(args.label, "Season label") }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

/** Removing a season takes its phase-0 checklist with it, but never a chain plan. */
export const remove = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (plans.length > 0) {
      throw new ConvexError(
        `This season still has ${plans.length} chain plan(s). Delete those first.`,
      );
    }

    await deleteTasks(
      ctx,
      await ctx.db
        .query("tasks")
        .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
        .collect(),
    );
    await ctx.db.delete(args.seasonId);
  },
});
