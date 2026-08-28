import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { authedQuery } from "./access";
import { mustGet, optionalText, requiredText } from "./model";

// Retail accounts. A chain is reference data: it owns nothing itself, but a
// chain plan cannot exist without one, and it is readable by every signed-in
// User (#22) — the name above a plan a Member holds comes from here.

export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const chains = await ctx.db.query("chains").collect();
    return chains.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: { name: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const name = requiredText(args.name, "Chain name");
    const existing = await ctx.db
      .query("chains")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing !== null) throw new ConvexError(`${name} is already on the chain list.`);

    return await ctx.db.insert("chains", { name, notes: optionalText(args.notes) });
  },
});

export const update = mutation({
  args: {
    chainId: v.id("chains"),
    name: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.chainId, "chain");
    await ctx.db.patch(args.chainId, {
      ...(args.name === undefined ? {} : { name: requiredText(args.name, "Chain name") }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

export const remove = mutation({
  args: { chainId: v.id("chains") },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("chainPlans")
      .withIndex("by_chain", (q) => q.eq("chainId", args.chainId))
      .collect();
    if (plans.length > 0) {
      throw new ConvexError(
        `This chain has ${plans.length} plan(s) across seasons. Delete those first.`,
      );
    }
    await ctx.db.delete(args.chainId);
  },
});
