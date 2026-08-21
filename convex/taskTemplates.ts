import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { phase } from "./schema";
import { mustGet, optionalText, requiredText } from "./model";
import { DEFAULT_TASK_TEMPLATES } from "./templateDefaults";

// The Task Template (CONTEXT.md): one global menu of default tasks per phase,
// edited in Manage and stamped onto every newly created plan year, chain plan
// and promotion (model.ts: stampTemplates). A stencil — nothing here ever
// touches a checklist that already exists.

export const list = query({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("taskTemplates").collect();
    return templates.sort((a, b) => a.phase - b.phase || a.order - b.order);
  },
});

export const create = mutation({
  args: {
    phase,
    name: v.string(),
    spec: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("taskTemplates")
      .withIndex("by_phase", (q) => q.eq("phase", args.phase))
      .collect();

    return await ctx.db.insert("taskTemplates", {
      phase: args.phase,
      name: requiredText(args.name, "Template task name"),
      spec: optionalText(args.spec),
      category: optionalText(args.category),
      quantity: args.quantity ?? undefined,
      order: siblings.reduce((max, row) => Math.max(max, row.order + 1), 0),
    });
  },
});

export const update = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    name: v.optional(v.string()),
    spec: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.templateId, "template task");
    await ctx.db.patch(args.templateId, {
      ...(args.name === undefined
        ? {}
        : { name: requiredText(args.name, "Template task name") }),
      ...(args.spec === undefined ? {} : { spec: optionalText(args.spec) }),
      ...(args.category === undefined ? {} : { category: optionalText(args.category) }),
      ...(args.quantity === undefined ? {} : { quantity: args.quantity ?? undefined }),
    });
  },
});

export const remove = mutation({
  args: { templateId: v.id("taskTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.templateId);
  },
});

/** Nudges a template up or down its phase section, mirroring tasks.move. */
export const move = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const template = await mustGet(ctx, args.templateId, "template task");
    const section = (
      await ctx.db
        .query("taskTemplates")
        .withIndex("by_phase", (q) => q.eq("phase", template.phase))
        .collect()
    ).sort((a, b) => a.order - b.order);

    const index = section.findIndex((row) => row._id === template._id);
    const swapWith = section[args.direction === "up" ? index - 1 : index + 1];
    if (swapWith === undefined) return;

    await ctx.db.patch(template._id, { order: swapWith.order });
    await ctx.db.patch(swapWith._id, { order: template.order });
  },
});

/**
 * Fills an empty template table with the deck's default menu — the Manage
 * empty-state button. Guarded to empty so a double click cannot duplicate the
 * menu; an edited table is the team's own and stays untouched.
 */
export const loadDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("taskTemplates").first();
    if (existing !== null) {
      throw new ConvexError("The template already has tasks — edit those instead.");
    }

    const perPhase = new Map<number, number>();
    for (const row of DEFAULT_TASK_TEMPLATES) {
      const order = perPhase.get(row.phase) ?? 0;
      perPhase.set(row.phase, order + 1);
      await ctx.db.insert("taskTemplates", { ...row, order });
    }
    return { inserted: DEFAULT_TASK_TEMPLATES.length };
  },
});
