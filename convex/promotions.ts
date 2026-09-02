import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { removeForPromotion } from "./kpi";
import {
  checkedDay,
  deleteTasks,
  fromUrl,
  mustGet,
  optionalText,
  PROMOTION_PHASES,
  patched,
  patchedRequiredText,
  patchedText,
  promotionPhase,
  raciDefaults,
  requiredText,
  rollup,
  stampTemplates,
} from "./model";

// The bottom tier: an approved program under a chain plan, carrying phases 5-8
// (activation planning -> retail execution -> tracking -> review).

/**
 * Cleans the brand list: no duplicates, and every id has to resolve. Unlike a
 * stale person (tasks.ts: livePeople) a missing brand is refused rather than
 * dropped — a promotion is defined by what it promotes.
 */
async function checkedBrands(ctx: QueryCtx, ids: readonly Id<"brands">[]) {
  const unique = [...new Set(ids)];
  const found = await Promise.all(unique.map((id) => ctx.db.get(id)));
  if (found.some((brand) => brand === null)) {
    throw new ConvexError(
      "One of those brands no longer exists — refresh the brand list and try again.",
    );
  }
  return unique;
}

/**
 * The promotion page: its 5-8 checklist, brands, and where it sits in the tree.
 * Null when the id no longer resolves, so a stale link degrades gracefully.
 */
export const get = query({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { promotionId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const promotion = await fromUrl(ctx, "promotions", args.promotionId);
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
    currentPhase: v.optional(promotionPhase),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const plan = await mustGet(ctx, args.chainPlanId, "chain plan");
    const startDate = checkedDay(args.startDate, "Start date");
    const endDate = checkedDay(args.endDate, "End date");
    if (endDate < startDate) throw new ConvexError("The end date is before the start date.");

    const promotionId = await ctx.db.insert("promotions", {
      chainPlanId: plan._id,
      // Copied from the plan so a promotion can name its chain and plan year
      // without loading the plan first (schema.ts: promotions).
      chainId: plan.chainId,
      seasonId: plan.seasonId,
      name: requiredText(args.name, "Promotion name"),
      brandIds: await checkedBrands(ctx, args.brandIds ?? []),
      startDate,
      endDate,
      storeCount: args.storeCount ?? undefined,
      currentPhase: args.currentPhase ?? 5,
      notes: optionalText(args.notes),
    });
    await stampTemplates(ctx, { tier: "promotion", promotionId }, PROMOTION_PHASES);
    return promotionId;
  },
});

/** Inline edits; every field keeps its current value unless sent (model.ts: patched). */
export const update = mutation({
  args: {
    promotionId: v.id("promotions"),
    name: v.optional(v.string()),
    brandIds: v.optional(v.array(v.id("brands"))),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    storeCount: v.optional(v.union(v.number(), v.null())),
    currentPhase: v.optional(promotionPhase),
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
      name: patchedRequiredText(args.name, promotion.name, "Promotion name"),
      brandIds:
        args.brandIds === undefined ? promotion.brandIds : await checkedBrands(ctx, args.brandIds),
      startDate,
      endDate,
      storeCount: patched(args.storeCount, promotion.storeCount),
      currentPhase: patched(args.currentPhase, promotion.currentPhase),
      notes: patchedText(args.notes, promotion.notes),
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
