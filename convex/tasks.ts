import type { WithoutSystemFields } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedMutation, writableOwner, writableTask } from "./access";
import {
  assertBlockedReason,
  assertPhaseInTier,
  checkedDay,
  moveDirection,
  nextOrder,
  optionalText,
  ownerFields,
  patchedText,
  requiredText,
  swapOrder,
  type TaskOwner,
  taskOwner,
} from "./model";
import { phase, taskStatus } from "./schema";

// Every write to a phase checklist. Reads live with the tier that owns the
// checklist (seasons / chainPlans / promotions), because a task is never
// interesting on its own — only as a row under its owner.
//
// This is the whole of what a Member controls (#22, stories 12-16): inside a
// granted scope they create, edit, assign, block and delete freely, and every
// one of these functions refuses the identical way for a task or an owner their
// Access Assignments do not reach.

/** An ETA is optional, but once given it has to be a calendar day (model.ts: checkedDay). */
function checkedEta(eta: string | null | undefined): string | undefined {
  const value = optionalText(eta);
  return value === undefined ? undefined : checkedDay(value, "ETA");
}

function checkedQuantity(quantity: number | null | undefined): number | undefined {
  if (quantity === null || quantity === undefined) return undefined;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new ConvexError("Quantity must be zero or more.");
  }
  return Math.round(quantity);
}

/**
 * Cleans a person list (Responsible, Consulted or Informed): no duplicates, and
 * no ids whose person has since been deleted — an unresolvable id would render
 * as a blank chip forever.
 */
async function livePeople(ctx: QueryCtx, ids: readonly Id<"people">[]) {
  const found = await Promise.all([...new Set(ids)].map((id) => ctx.db.get(id)));
  return found.filter((person) => person !== null).map((person) => person._id);
}

/** Adds a row to a phase checklist. Freeform: a name is the only requirement. */
export const create = authedMutation({
  args: {
    owner: taskOwner,
    phase,
    name: v.string(),
    spec: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.union(v.number(), v.null())),
    eta: v.optional(v.union(v.string(), v.null())),
    responsiblePersonIds: v.optional(v.array(v.id("people"))),
  },
  handler: async (ctx, args) => {
    assertPhaseInTier(args.phase, args.owner.tier);
    // The parent decides, not the argument: an owner the viewer cannot reach
    // fails here exactly as a deleted one does.
    await writableOwner(ctx, ctx.scope, args.owner);
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
      responsiblePersonIds: await livePeople(ctx, args.responsiblePersonIds ?? []),
      consultedPersonIds: [],
      informedPersonIds: [],
      order: nextOrder(siblings),
      ...ctx.stamp,
    });
  },
});

/**
 * Inline field edits. Omitting a field leaves it alone; passing `null` clears
 * it, which is how the UI empties an ETA or a quantity.
 */
export const update = authedMutation({
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
    // R, C and I are whole-list replacements: the editor sends the set it wants.
    // A stays a single person — one name to chase (CONTEXT.md: RACI).
    responsiblePersonIds: v.optional(v.array(v.id("people"))),
    accountablePersonId: v.optional(v.union(v.id("people"), v.null())),
    consultedPersonIds: v.optional(v.array(v.id("people"))),
    informedPersonIds: v.optional(v.array(v.id("people"))),
  },
  handler: async (ctx, args) => {
    const { task } = await writableTask(ctx, ctx.scope, args.taskId);
    const patch: Partial<WithoutSystemFields<Doc<"tasks">>> = { ...ctx.stamp };

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
    if (args.responsiblePersonIds !== undefined) {
      patch.responsiblePersonIds = await livePeople(ctx, args.responsiblePersonIds);
      // Writes migrate as they happen: the list is now the truth for this task.
      patch.responsiblePersonId = undefined;
    }
    if (args.accountablePersonId !== undefined) {
      patch.accountablePersonId = args.accountablePersonId ?? undefined;
    }
    if (args.consultedPersonIds !== undefined) {
      patch.consultedPersonIds = await livePeople(ctx, args.consultedPersonIds);
    }
    if (args.informedPersonIds !== undefined) {
      patch.informedPersonIds = await livePeople(ctx, args.informedPersonIds);
    }

    await ctx.db.patch(task._id, patch);
  },
});

/**
 * The status transition, kept separate from `update` so the blocked-reason rule
 * has exactly one place to live. Moving off Blocked drops the stale reason.
 */
export const setStatus = authedMutation({
  args: {
    taskId: v.id("tasks"),
    status: taskStatus,
    blockedReason: v.optional(v.string()),
    deliveredTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { task } = await writableTask(ctx, ctx.scope, args.taskId);
    // Re-blocking a task that already carries a reason may reuse it.
    const proposed = args.blockedReason ?? task.blockedReason;

    await ctx.db.patch(task._id, {
      ...ctx.stamp,
      status: args.status,
      blockedReason: assertBlockedReason(args.status, proposed),
      deliveredTo: patchedText(args.deliveredTo, task.deliveredTo),
    });
  },
});

export const remove = authedMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const { task } = await writableTask(ctx, ctx.scope, args.taskId);
    await ctx.db.delete(task._id);
  },
});

/**
 * Nudges a task up or down within its category group — the rows the checklist
 * draws under one heading (PhaseChecklist: groupByCategory) — so a move never
 * jumps a task into another group.
 */
export const move = authedMutation({
  args: {
    taskId: v.id("tasks"),
    direction: moveDirection,
  },
  handler: async (ctx, args) => {
    const { task, owner } = await writableTask(ctx, ctx.scope, args.taskId);
    const group = (await siblingsOf(ctx, owner)).filter(
      (candidate) => candidate.phase === task.phase && candidate.category === task.category,
    );
    // Reordering is a change to both rows, so both carry the stamp.
    await swapOrder(ctx, task, group, args.direction, ctx.stamp);
  },
});

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
