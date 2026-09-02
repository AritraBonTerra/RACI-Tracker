import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  deleteTasks,
  fromUrl,
  mustGet,
  optionalText,
  patchedRequiredText,
  patchedText,
  raciDefaults,
  rollup,
  SEASON_PHASES,
  stampTemplates,
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
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { seasonId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const season = await fromUrl(ctx, "seasons", args.seasonId);
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
  args: { seasonId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const season = await fromUrl(ctx, "seasons", args.seasonId);
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
                            .withIndex("by_promotion", (q) => q.eq("promotionId", promotion._id))
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
    chainPlanId: v.optional(v.string()),
    promotionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The plan comes back too, so the sidebar can hold the right branch open
    // without walking the tree to find which plan a promotion sits under.
    if (args.promotionId !== undefined) {
      const promotion = await fromUrl(ctx, "promotions", args.promotionId);
      return promotion === null
        ? null
        : { seasonId: promotion.seasonId, chainPlanId: promotion.chainPlanId };
    }
    if (args.chainPlanId !== undefined) {
      const plan = await fromUrl(ctx, "chainPlans", args.chainPlanId);
      return plan === null ? null : { seasonId: plan.seasonId, chainPlanId: plan._id };
    }
    return null;
  },
});

export const create = mutation({
  args: {
    year: v.number(),
    label: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .first();
    if (existing !== null) throw new ConvexError(`Year ${args.year} already exists.`);

    const seasonId = await ctx.db.insert("seasons", {
      year: args.year,
      label: optionalText(args.label) ?? String(args.year),
      notes: optionalText(args.notes),
    });
    await stampTemplates(ctx, { tier: "season", seasonId }, SEASON_PHASES);
    return seasonId;
  },
});

export const update = mutation({
  args: {
    seasonId: v.id("seasons"),
    label: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const season = await mustGet(ctx, args.seasonId, "season");
    await ctx.db.patch(season._id, {
      label: patchedRequiredText(args.label, season.label, "Year label"),
      notes: patchedText(args.notes, season.notes),
    });
  },
});

/** Removing a plan year takes its phase-0 checklist with it, but never a chain plan. */
export const remove = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (plans.length > 0) {
      throw new ConvexError(
        `This year still has ${plans.length} chain plan(s). Delete those first.`,
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
