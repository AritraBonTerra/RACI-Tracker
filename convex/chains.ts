import { ConvexError, v } from "convex/values";
import { adminMutation, adminQuery } from "./access";
import { mustGet, optionalText, patchedRequiredText, patchedText, requiredText } from "./model";

// Retail accounts. A chain is reference data: it owns nothing itself, but a
// chain plan cannot exist without one, and the name above a plan a Member holds
// comes from here — reached through `seasons.tree`, which hands a Member only
// the chains they hold a plan on.

// The whole account list is the shape of the company's business, so it is the
// Administrator's alone (#22, story 29): the one consumer is Manage, and
// `seasons.tree` deliberately withholds planless chains from a Member.
export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const chains = await ctx.db.query("chains").collect();
    return chains.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Reference data is the Administrator's to shape (#22, story 29): a Chain is
// the name every plan under it inherits, so renaming one reaches every Member
// who holds a plan on it.
export const create = adminMutation({
  args: { name: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const name = requiredText(args.name, "Chain name");
    const existing = await ctx.db
      .query("chains")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing !== null) throw new ConvexError(`${name} is already on the chain list.`);

    return await ctx.db.insert("chains", {
      name,
      notes: optionalText(args.notes),
      ...ctx.stamp,
    });
  },
});

export const update = adminMutation({
  args: {
    chainId: v.id("chains"),
    name: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const chain = await mustGet(ctx, args.chainId, "chain");
    await ctx.db.patch(chain._id, {
      ...ctx.stamp,
      name: patchedRequiredText(args.name, chain.name, "Chain name"),
      notes: patchedText(args.notes, chain.notes),
    });
  },
});

export const remove = adminMutation({
  args: { chainId: v.id("chains") },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_chain", (q) => q.eq("chainId", args.chainId))
      .collect();
    if (plans.length > 0) {
      throw new ConvexError(
        `This chain has ${plans.length} plan(s) across plan years. Delete those first.`,
      );
    }
    await ctx.db.delete(args.chainId);
  },
});
