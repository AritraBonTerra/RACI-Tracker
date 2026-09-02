import { ConvexError, v } from "convex/values";
import {
  adminMutation,
  authedMutation,
  authedQuery,
  editorsOf,
  readableChainPlan,
  readablePromotion,
  readableSeason,
  visibleSeason,
  writableSeason,
} from "./access";
import {
  chainLabel,
  deleteTasks,
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
//
// Every read here is built top-down from what the viewer's Access Assignments
// reach (access.ts), so a record outside their scope is never filtered out of a
// list — it never enters one.

export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const seasons = await ctx.db.query("seasons").collect();
    return seasons
      .flatMap((season) => {
        const reach = ctx.scope.season(season._id);
        if (reach === "none") return [];
        return [
          {
            _id: season._id,
            year: season.year,
            label: season.label,
            // The year above a granted Chain Plan is a label, and its note is
            // phase-0 content: the name orients, the content stays behind the
            // grant.
            notes: reach === "full" ? season.notes : undefined,
            reach,
          },
        ];
      })
      .sort((a, b) => b.year - a.year);
  },
});

/**
 * The season page: its own phase-0 checklist. Returns null for an id that no
 * longer resolves *or* that the viewer's scope does not reach, so a stale
 * bookmark and a denied deep link render the same message.
 */
export const overview = authedQuery({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { seasonId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const season = await readableSeason(ctx, ctx.scope, args.seasonId);
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
      // Names for the last-modified stamps on the year and every row of its
      // checklist, so "who changed this?" is answered on the page (#22).
      editors: await editorsOf(ctx, [season, ...tasks]),
    };
  },
});

/**
 * The navigation tree for one season, with a health rollup on every node so the
 * sidebar can show where the trouble is without a second round trip.
 *
 * Nodes carry their reach, because the tree is where the three navigation
 * states are decided (#24): a granted scope is a link, an ancestor of one is a
 * plain label with no content behind it, and everything else is simply not in
 * the tree. Chains with no plan are the Administrator's "start one here"
 * affordance and are absent for a Member, who could not start one anyway.
 */
export const tree = authedQuery({
  args: { seasonId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const visible = await visibleSeason(ctx, ctx.scope, args.seasonId);
    if (visible === null) return null;
    const { season, reach } = visible;

    const seasonTasks =
      reach === "full"
        ? await ctx.db
            .query("tasks")
            .withIndex("by_season", (q) => q.eq("seasonId", season._id))
            .collect()
        : [];

    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const chains = await ctx.db.query("chains").collect();

    const chainNodes = await Promise.all(
      chains
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (chain) => ({
          // A name, not the record: the tree names the chain above someone's
          // promotion, and a name is all an ancestor ever is.
          chain: chainLabel(chain),
          plans: (
            await Promise.all(
              plans
                .filter((plan) => plan.chainId === chain._id)
                .map(async (plan) => {
                  const planReach = ctx.scope.chainPlan(plan);
                  if (planReach === "none") return [];

                  const promotions = await ctx.db
                    .query("promotions")
                    .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
                    .collect();

                  const promotionNodes = await Promise.all(
                    promotions
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

                  if (planReach === "context") {
                    // Nothing but the id: the chain's own name comes from the
                    // reference data above, and its phases are not readable.
                    return [
                      {
                        reach: "context" as const,
                        chainPlanId: plan._id,
                        promotions: promotionNodes,
                      },
                    ];
                  }

                  const planTasks = await ctx.db
                    .query("tasks")
                    .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", plan._id))
                    .collect();

                  return [
                    {
                      reach: "full" as const,
                      chainPlanId: plan._id,
                      plan,
                      rollup: rollup(planTasks, args.today),
                      promotions: promotionNodes,
                    },
                  ];
                }),
            )
          ).flat(),
        })),
    );

    return {
      // Year and label only: the tree names the year even when the viewer's
      // access starts below it.
      season: { _id: season._id, year: season.year, label: season.label },
      reach,
      seasonRollup: reach === "full" ? rollup(seasonTasks, args.today) : null,
      chains: chainNodes.filter((node) => node.plans.length > 0 || ctx.scope.isAdministrator),
    };
  },
});

/**
 * Which season a deep link belongs to. A link to a promotion has to be able to
 * draw the whole navigation tree around it, and only the backend knows which
 * season that promotion sits under. Out of scope answers null, exactly as a
 * deleted id does — this is a lookup, not a directory.
 */
export const contextFor = authedQuery({
  args: {
    chainPlanId: v.optional(v.string()),
    promotionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // The plan comes back too, so the sidebar can hold the right branch open
    // without walking the tree to find which plan a promotion sits under.
    if (args.promotionId !== undefined) {
      const promotion = await readablePromotion(ctx, ctx.scope, args.promotionId);
      return promotion === null
        ? null
        : { seasonId: promotion.seasonId, chainPlanId: promotion.chainPlanId };
    }
    if (args.chainPlanId !== undefined) {
      const plan = await readableChainPlan(ctx, ctx.scope, args.chainPlanId);
      return plan === null ? null : { seasonId: plan.seasonId, chainPlanId: plan._id };
    }
    return null;
  },
});

/**
 * Creating and deleting a Plan Year is an Administrator's alone (#22, story
 * 29): the hierarchy stays governed, and a Member's grant is a place to work,
 * not a licence to reshape the tree around it. Editing the year's own fields is
 * not — that is `update`, open to whoever holds the year.
 */
export const create = adminMutation({
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
      ...ctx.stamp,
    });
    await stampTemplates(ctx, { tier: "season", seasonId }, SEASON_PHASES, ctx.stamp);
    return seasonId;
  },
});

/** Keeping the year's own fields current, for anyone whose scope covers it. */
export const update = authedMutation({
  args: {
    seasonId: v.id("seasons"),
    label: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const season = await writableSeason(ctx, ctx.scope, args.seasonId);
    await ctx.db.patch(season._id, {
      ...ctx.stamp,
      label: patchedRequiredText(args.label, season.label, "Year label"),
      notes: patchedText(args.notes, season.notes),
    });
  },
});

/** Removing a plan year takes its phase-0 checklist with it, but never a chain plan. */
export const remove = adminMutation({
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
