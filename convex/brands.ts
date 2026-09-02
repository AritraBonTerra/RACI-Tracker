import { ConvexError, v } from "convex/values";
import { adminMutation, authedQuery } from "./access";
import {
  mustGet,
  optionalText,
  patched,
  patchedRequiredText,
  patchedText,
  requiredText,
} from "./model";

// The portfolio list. Entries are flagged as placeholders until the real brand
// data is loaded, and promotions point at them by id.
//
// Reference data: readable by every signed-in User and unfiltered by scope
// (#22). A brand name is not somebody's plan, and a promotion's brand chips
// have to resolve for whoever can see the promotion.

export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const brands = await ctx.db.query("brands").collect();
    return brands.sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Reference data: readable by everyone signed in, writable by an Administrator
// alone (#22, story 29).
export const create = adminMutation({
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
      ...ctx.stamp,
    });
  },
});

export const update = adminMutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    isPlaceholder: v.optional(v.boolean()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const brand = await mustGet(ctx, args.brandId, "brand");
    await ctx.db.patch(brand._id, {
      ...ctx.stamp,
      name: patchedRequiredText(args.name, brand.name, "Brand name"),
      isPlaceholder: patched(args.isPlaceholder, brand.isPlaceholder),
      notes: patchedText(args.notes, brand.notes),
    });
  },
});

export const remove = adminMutation({
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
