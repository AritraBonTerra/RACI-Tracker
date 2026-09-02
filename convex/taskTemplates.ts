import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  moveDirection,
  mustGet,
  nextOrder,
  optionalText,
  patched,
  patchedRequiredText,
  patchedText,
  requiredText,
  swapOrder,
} from "./model";
import { phase } from "./schema";
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
      order: nextOrder(siblings),
    });
  },
});

/** Inline edits; every field keeps its current value unless sent (model.ts: patched). */
export const update = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    name: v.optional(v.string()),
    spec: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const template = await mustGet(ctx, args.templateId, "template task");
    await ctx.db.patch(template._id, {
      name: patchedRequiredText(args.name, template.name, "Template task name"),
      spec: patchedText(args.spec, template.spec),
      category: patchedText(args.category, template.category),
      quantity: patched(args.quantity, template.quantity),
    });
  },
});

export const remove = mutation({
  args: { templateId: v.id("taskTemplates") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.templateId);
  },
});

/**
 * Nudges a template up or down its phase section. The whole phase is one list
 * here — Manage draws templates flat, without the category headings a
 * checklist gets — so unlike tasks.move the swap ignores `category`.
 */
export const move = mutation({
  args: {
    templateId: v.id("taskTemplates"),
    direction: moveDirection,
  },
  handler: async (ctx, args) => {
    const template = await mustGet(ctx, args.templateId, "template task");
    const section = await ctx.db
      .query("taskTemplates")
      .withIndex("by_phase", (q) => q.eq("phase", template.phase))
      .collect();
    await swapOrder(ctx, template, section, args.direction);
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
