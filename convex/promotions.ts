import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { phase } from "./schema";
import { removeForPromotion } from "./kpi";
import {
  PROMOTION_PHASES,
  deleteTasks,
  mustGet,
  optionalText,
  raciDefaults,
  requiredText,
  rollup,
} from "./model";

// The bottom tier: an approved program under a chain plan, carrying phases 5-8
// (activation planning -> retail execution -> tracking -> review).

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkedDay(value: string, field: string) {
  const day = requiredText(value, field);
  if (!ISO_DAY.test(day)) {
    throw new ConvexError(`${field} must be a calendar day (expected 2026-10-31).`);
  }
  return day;
}

/**
 * The promotion page: its 5-8 checklist, brands, and where it sits in the tree.
 * Null when the id no longer resolves, so a stale link degrades gracefully.
 */
export const get = query({
  args: { promotionId: v.id("promotions"), today: v.string() },
  handler: async (ctx, args) => {
    const promotion = await ctx.db.get(args.promotionId);
    if (promotion === null) return null;
    const plan = await mustGet(ctx, promotion.chainPlanId, "chain plan");
    const chain = await mustGet(ctx, promotion.chainId, "chain");
    const season = await mustGet(ctx, promotion.seasonId, "season");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_promotion", (q) => q.eq("promotionId", promotion._id))
      .collect();

    const brands = await Promise.all(promotion.brandIds.map((id) => ctx.db.get(id)));

    return {
      promotion,
      plan,
      chain,
      season,
      brands: brands.filter((brand) => brand !== null),
      tasks: tasks.sort((a, b) => a.order - b.order),
      rollup: rollup(tasks, args.today),
      raciDefaults: await raciDefaults(ctx, PROMOTION_PHASES),
    };
  },
});

export const create = mutation({
  args: {
    chainPlanId: v.id("chainPlans"),
    name: v.string(),
    brandIds: v.optional(v.array(v.id("brands"))),
    startDate: v.string(),
    endDate: v.string(),
    storeCount: v.optional(v.union(v.number(), v.null())),
    currentPhase: v.optional(phase),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plan = await mustGet(ctx, args.chainPlanId, "chain plan");
    const startDate = checkedDay(args.startDate, "Start date");
    const endDate = checkedDay(args.endDate, "End date");
    if (endDate < startDate) throw new ConvexError("The end date is before the start date.");

    return await ctx.db.insert("promotions", {
      chainPlanId: plan._id,
      // Denormalized from the plan so "every Safeway promotion" is one index read.
      chainId: plan.chainId,
      seasonId: plan.seasonId,
      name: requiredText(args.name, "Promotion name"),
      brandIds: args.brandIds ?? [],
      startDate,
      endDate,
      storeCount: args.storeCount ?? undefined,
      currentPhase: args.currentPhase ?? 5,
      notes: optionalText(args.notes),
    });
  },
});

export const update = mutation({
  args: {
    promotionId: v.id("promotions"),
    name: v.optional(v.string()),
    brandIds: v.optional(v.array(v.id("brands"))),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    storeCount: v.optional(v.union(v.number(), v.null())),
    currentPhase: v.optional(phase),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const promotion = await mustGet(ctx, args.promotionId, "promotion");

    const startDate =
      args.startDate === undefined ? promotion.startDate : checkedDay(args.startDate, "Start date");
    const endDate =
      args.endDate === undefined ? promotion.endDate : checkedDay(args.endDate, "End date");
    if (endDate < startDate) throw new ConvexError("The end date is before the start date.");

    await ctx.db.patch(promotion._id, {
      startDate,
      endDate,
      ...(args.name === undefined ? {} : { name: requiredText(args.name, "Promotion name") }),
      ...(args.brandIds === undefined ? {} : { brandIds: args.brandIds }),
      ...(args.storeCount === undefined ? {} : { storeCount: args.storeCount ?? undefined }),
      ...(args.currentPhase === undefined ? {} : { currentPhase: args.currentPhase }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

/**
 * A promotion owns its whole 5-8 checklist, so removing it removes those tasks —
 * and its phase-7/8 measurement rows.
 */
export const remove = mutation({
  args: { promotionId: v.id("promotions") },
  handler: async (ctx, args) => {
    // Detachable feature (#14): drop this line with `convex/kpi.ts`.
    await removeForPromotion(ctx, args.promotionId);
    await deleteTasks(
      ctx,
      await ctx.db
        .query("tasks")
        .withIndex("by_promotion", (q) => q.eq("promotionId", args.promotionId))
        .collect(),
    );
    await ctx.db.delete(args.promotionId);
  },
});
