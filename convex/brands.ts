import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { mustGet, optionalText, requiredText } from "./model";

// The portfolio list. Entries are flagged as placeholders until the real brand
// data is loaded, and promotions point at them by id.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    return brands.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    isPlaceholder: v.optional(v.boolean()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = requiredText(args.name, "Brand name");
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (existing !== null) throw new ConvexError(`${name} is already on the brand list.`);

    return await ctx.db.insert("brands", {
      name,
      isPlaceholder: args.isPlaceholder ?? true,
      notes: optionalText(args.notes),
    });
  },
});

export const update = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    isPlaceholder: v.optional(v.boolean()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.brandId, "brand");
    await ctx.db.patch(args.brandId, {
      ...(args.name === undefined ? {} : { name: requiredText(args.name, "Brand name") }),
      ...(args.isPlaceholder === undefined ? {} : { isPlaceholder: args.isPlaceholder }),
      ...(args.notes === undefined ? {} : { notes: optionalText(args.notes) }),
    });
  },
});

export const remove = mutation({
  args: { brandId: v.id("brands") },
  handler: async (ctx, args) => {
    const promotions = await ctx.db.query("promotions").collect();
    const used = promotions.filter((promotion) => promotion.brandIds.includes(args.brandId));
    if (used.length > 0) {
      throw new ConvexError(
        `${used.length} promotion(s) still list this brand: ${used
          .map((promotion) => promotion.name)
          .join(", ")}.`,
      );
    }
    await ctx.db.delete(args.brandId);
  },
});
