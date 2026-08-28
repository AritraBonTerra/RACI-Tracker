import { ConvexError, v } from "convex/values";
import {
  adminMutation,
  authedMutation,
  authedQuery,
  editorsOf,
  readablePromotion,
  writableChainPlan,
  writablePromotion,
} from "./access";
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
  stampTemplates,
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
 * Null when the id no longer resolves or the viewer's scope does not reach it,
 * so a stale link and a denied one degrade identically.
 *
 * The two ancestors come back as names and reaches — "Kroger · 2026" is the
 * whole of the orientation a promotion-only Member gets, and neither crumb is a
 * link unless their scope covers it.
 */
export const get = authedQuery({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { promotionId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const promotion = await readablePromotion(ctx, ctx.scope, args.promotionId);
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
      plan: { _id: plan._id, reach: ctx.scope.chainPlan(plan) },
      chain,
      season: {
        _id: season._id,
        year: season.year,
        label: season.label,
        reach: ctx.scope.season(season._id),
      },
      brands: brands.filter((brand) => brand !== null),
      tasks: tasks.sort((a, b) => a.order - b.order),
      rollup: rollup(tasks, args.today),
      raciDefaults: await raciDefaults(ctx, PROMOTION_PHASES),
      editors: await editorsOf(ctx, [promotion, ...tasks]),
    };
  },
});

/**
 * Approving a program under a plan is an Administrator's alone (#22, story 29).
 * The plan is loaded and its ancestry asked, so the id in the argument names a
 * parent and never claims one.
 */
export const create = adminMutation({
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
    const plan = await writableChainPlan(ctx, ctx.scope, args.chainPlanId);
    const startDate = checkedDay(args.startDate, "Start date");
    const endDate = checkedDay(args.endDate, "End date");
    if (endDate < startDate)
      throw new ConvexError("The end date is before the start date.");

    const promotionId = await ctx.db.insert("promotions", {
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
      ...ctx.stamp,
    });
    await stampTemplates(
      ctx,
      { tier: "promotion", promotionId },
      PROMOTION_PHASES,
      ctx.stamp,
    );
    return promotionId;
  },
});

/**
 * The promotion's own fields — name, window, stores, brands, phase, notes — for
 * anyone whose scope covers it. Keeping data current is the work, not a
 * privilege (#22, story 16).
 */
export const update = authedMutation({
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
    const promotion = await writablePromotion(ctx, ctx.scope, args.promotionId);

    const startDate =
      args.startDate === undefined
        ? promotion.startDate
        : checkedDay(args.startDate, "Start date");
    const endDate =
      args.endDate === undefined
        ? promotion.endDate
        : checkedDay(args.endDate, "End date");
    if (endDate < startDate)
      throw new ConvexError("The end date is before the start date.");

    await ctx.db.patch(promotion._id, {
      ...ctx.stamp,
      startDate,
      endDate,
      ...(args.name === undefined
        ? {}
        : { name: requiredText(args.name, "Promotion name") }),
      ...(args.brandIds === undefined ? {} : { brandIds: args.brandIds }),
      ...(args.storeCount === undefined
        ? {}
        : { storeCount: args.storeCount ?? undefined }),
      ...(args.currentPhase === undefined ? {} : { currentPhase: args.currentPhase }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

/**
 * A promotion owns its whole 5-8 checklist, so removing it removes those tasks —
 * and its phase-7/8 measurement rows.
 */
export const remove = adminMutation({
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
