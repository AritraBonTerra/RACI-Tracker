import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import { phase, taskStatus } from "./schema";
import {
  assertBlockedReason,
  assertPhaseMatchesOwner,
  mustGet,
  nextOrder,
  optionalText,
  ownerFields,
  requiredText,
  taskOwner,
  type TaskOwner,
} from "./model";

// Every write to a phase checklist. Reads live with the tier that owns the
// checklist (seasons / chainPlans / promotions), because a task is never
// interesting on its own — only as a row under its owner.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An ETA is a calendar day a human agreed to, so the string shape is the contract. */
function checkedEta(eta: string | null | undefined): string | undefined {
  const value = optionalText(eta);
  if (value !== undefined && !ISO_DAY.test(value)) {
    throw new ConvexError(`"${value}" is not a calendar day (expected 2026-10-31).`);
  }
  return value;
}

function checkedQuantity(quantity: number | null | undefined): number | undefined {
  if (quantity === null || quantity === undefined) return undefined;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new ConvexError("Quantity must be zero or more.");
  }
  return Math.round(quantity);
}

/** Adds a row to a phase checklist. Freeform: a name is the only requirement. */
export const create = mutation({
  args: {
    owner: taskOwner,
    phase,
    name: v.string(),
    spec: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.union(v.number(), v.null())),
    eta: v.optional(v.union(v.string(), v.null())),
    responsiblePersonId: v.optional(v.id("people")),
  },
  handler: async (ctx, args) => {
    assertPhaseMatchesOwner(args.phase, args.owner);
    const owner = ownerFields(args.owner);

    const siblings = await siblingsOf(ctx, args.owner);

    return await ctx.db.insert("tasks", {
      ...owner,
      phase: args.phase,
      name: requiredText(args.name, "Task name"),
      spec: optionalText(args.spec),
      category: optionalText(args.category),
      quantity: checkedQuantity(args.quantity),
      eta: checkedEta(args.eta),
      status: "not_started",
      responsiblePersonId: args.responsiblePersonId,
      consultedPersonIds: [],
      informedPersonIds: [],
      order: nextOrder(siblings),
    });
  },
});

/**
 * Inline field edits. Omitting a field leaves it alone; passing `null` clears
 * it, which is how the UI empties an ETA or a quantity.
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    name: v.optional(v.string()),
    spec: v.optional(v.union(v.string(), v.null())),
    category: v.optional(v.union(v.string(), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
    eta: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    deliveredTo: v.optional(v.union(v.string(), v.null())),
    proofOfExecution: v.optional(v.union(v.string(), v.null())),
    responsiblePersonId: v.optional(v.union(v.id("people"), v.null())),
    accountablePersonId: v.optional(v.union(v.id("people"), v.null())),
  },
  handler: async (ctx, args) => {
    const task = await mustGet(ctx, args.taskId, "task");
    const patch: Partial<Doc<"tasks">> = {};

    if (args.name !== undefined) patch.name = requiredText(args.name, "Task name");
    if (args.spec !== undefined) patch.spec = optionalText(args.spec);
    if (args.category !== undefined) patch.category = optionalText(args.category);
    if (args.quantity !== undefined) patch.quantity = checkedQuantity(args.quantity);
    if (args.eta !== undefined) patch.eta = checkedEta(args.eta);
    if (args.notes !== undefined) patch.notes = optionalText(args.notes);
    if (args.deliveredTo !== undefined) patch.deliveredTo = optionalText(args.deliveredTo);
    if (args.proofOfExecution !== undefined) {
      patch.proofOfExecution = optionalText(args.proofOfExecution);
    }
    if (args.responsiblePersonId !== undefined) {
      patch.responsiblePersonId = args.responsiblePersonId ?? undefined;
    }
    if (args.accountablePersonId !== undefined) {
      patch.accountablePersonId = args.accountablePersonId ?? undefined;
    }

    await ctx.db.patch(task._id, patch);
  },
});

/**
 * The status transition, kept separate from `update` so the blocked-reason rule
 * has exactly one place to live. Moving off Blocked drops the stale reason.
 */
export const setStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatus,
    blockedReason: v.optional(v.string()),
    deliveredTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await mustGet(ctx, args.taskId, "task");
    // Re-blocking a task that already carries a reason may reuse it.
    const proposed = args.blockedReason ?? task.blockedReason;

    await ctx.db.patch(task._id, {
      status: args.status,
      blockedReason: assertBlockedReason(args.status, proposed),
      deliveredTo:
        args.deliveredTo === undefined ? task.deliveredTo : optionalText(args.deliveredTo),
    });
  },
});

export const remove = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.taskId);
  },
});

/** Nudges a task up or down its phase section by swapping `order` with its neighbour. */
export const move = mutation({
  args: {
    taskId: v.id("tasks"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const task = await mustGet(ctx, args.taskId, "task");
    const section = (await siblingsOf(ctx, ownerOf(task)))
      .filter((candidate) => candidate.phase === task.phase)
      .sort((a, b) => a.order - b.order);

    const index = section.findIndex((candidate) => candidate._id === task._id);
    const swapWith = section[args.direction === "up" ? index - 1 : index + 1];
    if (swapWith === undefined) return;

    await ctx.db.patch(task._id, { order: swapWith.order });
    await ctx.db.patch(swapWith._id, { order: task.order });
  },
});

/** Reconstructs a task's owner from its three ownership columns. */
function ownerOf(task: Doc<"tasks">) {
  if (task.seasonId !== undefined) return { tier: "season", seasonId: task.seasonId } as const;
  if (task.chainPlanId !== undefined) {
    return { tier: "chainPlan", chainPlanId: task.chainPlanId } as const;
  }
  if (task.promotionId !== undefined) {
    return { tier: "promotion", promotionId: task.promotionId } as const;
  }
  throw new ConvexError("Task is not attached to a season, chain plan or promotion.");
}

/** Every task under the same owner, across all of that tier's phases. */
async function siblingsOf(ctx: QueryCtx, owner: TaskOwner) {
  if (owner.tier === "season") {
    return await ctx.db
      .query("tasks")
      .withIndex("by_season", (q) => q.eq("seasonId", owner.seasonId))
      .collect();
  }
  if (owner.tier === "chainPlan") {
    return await ctx.db
      .query("tasks")
      .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", owner.chainPlanId))
      .collect();
  }
  return await ctx.db
    .query("tasks")
    .withIndex("by_promotion", (q) => q.eq("promotionId", owner.promotionId))
    .collect();
}
