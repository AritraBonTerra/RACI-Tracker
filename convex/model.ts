import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { phase, taskStatus } from "./schema";

// Shared domain rules for the three-tier model. Everything here is used by more
// than one function module; anything used by exactly one lives with it.

export type PhaseNumber = Infer<typeof phase>;
export type TaskStatus = Infer<typeof taskStatus>;

/**
 * `currentPhase` on an owner is narrowed to the phases that owner carries. A
 * task's `phase` keeps the full 0-8 range (schema.ts: phase).
 */
export const chainPlanPhase = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4));
export const promotionPhase = v.union(v.literal(5), v.literal(6), v.literal(7), v.literal(8));

/**
 * Where a task hangs. Exactly one of the three ownership columns is set, and
 * the tier is decided by the task's phase (CONTEXT.md: Phase).
 */
export const taskOwner = v.union(
  v.object({ tier: v.literal("season"), seasonId: v.id("seasons") }),
  v.object({ tier: v.literal("chainPlan"), chainPlanId: v.id("chainPlans") }),
  v.object({ tier: v.literal("promotion"), promotionId: v.id("promotions") }),
);

export type TaskOwner = Infer<typeof taskOwner>;

export const SEASON_PHASES = [0] as const satisfies readonly PhaseNumber[];
export const CHAIN_PLAN_PHASES = [1, 2, 3, 4] as const satisfies readonly Infer<
  typeof chainPlanPhase
>[];
export const PROMOTION_PHASES = [5, 6, 7, 8] as const satisfies readonly Infer<
  typeof promotionPhase
>[];
export const ALL_PHASES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const satisfies readonly PhaseNumber[];

/** The tier a phase belongs to: 0 -> season, 1-4 -> chain plan, 5-8 -> promotion. */
export function tierForPhase(value: PhaseNumber): TaskOwner["tier"] {
  if (value === 0) return "season";
  if (value <= 4) return "chainPlan";
  return "promotion";
}

const TIER_LABEL = {
  season: "the plan year (phase 0)",
  chainPlan: "a chain plan (phases 1-4)",
  promotion: "a promotion (phases 5-8)",
} as const satisfies Record<TaskOwner["tier"], string>;

/**
 * Rejects a task whose phase does not match the tier it is being attached to —
 * a phase-6 task on a chain plan would be invisible everywhere in the UI.
 */
export function assertPhaseMatchesOwner(value: PhaseNumber, owner: TaskOwner) {
  const expected = tierForPhase(value);
  if (expected !== owner.tier) {
    throw new ConvexError(
      `Phase ${value} belongs to ${TIER_LABEL[expected]}, not ${TIER_LABEL[owner.tier]}.`,
    );
  }
}

/** The ownership columns for a task, with the two unused ones left unset. */
export function ownerFields(owner: TaskOwner) {
  return {
    seasonId: owner.tier === "season" ? owner.seasonId : undefined,
    chainPlanId: owner.tier === "chainPlan" ? owner.chainPlanId : undefined,
    promotionId: owner.tier === "promotion" ? owner.promotionId : undefined,
  };
}

/** The inverse of `ownerFields`: a task's owner, read back from its columns. */
export function ownerOf(task: Doc<"tasks">): TaskOwner {
  if (task.seasonId !== undefined) return { tier: "season", seasonId: task.seasonId };
  if (task.chainPlanId !== undefined) {
    return { tier: "chainPlan", chainPlanId: task.chainPlanId };
  }
  if (task.promotionId !== undefined) {
    return { tier: "promotion", promotionId: task.promotionId };
  }
  throw new ConvexError("Task is not attached to a plan year, chain plan or promotion.");
}

/**
 * The one rule the schema cannot express: "no inventory at distributor" has to
 * be written down, because a blocked task without a reason hides the problem.
 */
export function assertBlockedReason(
  status: TaskStatus,
  reason: string | undefined,
): string | undefined {
  if (status !== "blocked") return undefined;
  const trimmed = reason?.trim();
  if (!trimmed) {
    throw new ConvexError("A blocked task needs a reason — say what is blocking it.");
  }
  return trimmed;
}

/** Trims free text, treating whitespace-only input as "not set". */
export function optionalText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Trims required free text and rejects an empty result. */
export function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new ConvexError(`${field} cannot be empty.`);
  return trimmed;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date is a calendar day a human agreed to ("2026-10-31"), so the string
 * shape is the contract (schema.ts: isoDate).
 */
export function checkedDay(value: string, field: string): string {
  const day = requiredText(value, field);
  if (!ISO_DAY.test(day)) {
    throw new ConvexError(`${field} must be a calendar day (expected 2026-10-31).`);
  }
  return day;
}

// Patch semantics shared by every inline-edit mutation: an argument left off
// means "leave this alone", and an explicit null means "clear it". Clicking
// into a cell, deleting the contents and tabbing away has to remove the value,
// not leave the last one sitting there.

export function patched<Value>(arg: Value | null | undefined, current: Value | undefined) {
  return arg === undefined ? current : (arg ?? undefined);
}

/** As `patched`, but whitespace-only text counts as clearing the field. */
export function patchedText(arg: string | null | undefined, current: string | undefined) {
  return arg === undefined ? current : optionalText(arg);
}

/** As `patched` for text that cannot be cleared — a name — so blank input is rejected. */
export function patchedRequiredText(arg: string | undefined, current: string, field: string) {
  return arg === undefined ? current : requiredText(arg, field);
}

/** A typed figure has to be a real number — "1,240" and "n/a" belong in a note. */
export function patchedNumber(
  arg: number | null | undefined,
  current: number | undefined,
  field: string,
) {
  if (arg === undefined) return current;
  if (arg === null) return undefined;
  if (!Number.isFinite(arg)) throw new ConvexError(`${field} must be a number.`);
  return arg;
}

/**
 * Loads a document from an id that arrived off the URL bar.
 *
 * These ids are untrusted strings, which is why the queries behind a route take
 * `v.string()` rather than `v.id()`: a mangled id — a link truncated by an email
 * client, a hand-edited hash — would fail argument validation before the handler
 * ran, and the client would get a server error instead of an answer.
 * `normalizeId` turns "not an id for this table" into the same `null` a deleted
 * row gives, so every dead link lands on the same "this is gone" screen.
 */
export async function fromUrl<Table extends TableNames>(
  ctx: QueryCtx,
  table: Table,
  id: string,
): Promise<Doc<Table> | null> {
  const normalized = ctx.db.normalizeId(table, id);
  return normalized === null ? null : await ctx.db.get(normalized);
}

/** Loads a document or fails loudly rather than returning a silent null. */
export async function mustGet<Table extends TableNames>(
  ctx: QueryCtx,
  id: Id<Table>,
  label: string,
): Promise<Doc<Table>> {
  const doc = await ctx.db.get(id);
  if (doc === null) throw new ConvexError(`That ${label} no longer exists.`);
  return doc;
}

/**
 * The slide-16 matrix rows for a tier's phases: which function is expected to
 * play which role. Shown as guidance on a phase header — never a substitute for
 * a named Responsible person.
 */
export async function raciDefaults(ctx: QueryCtx, phases: readonly PhaseNumber[]) {
  const functions = await ctx.db.query("functions").collect();
  const byId = new Map(functions.map((fn) => [fn._id, fn]));

  return await Promise.all(
    phases.map(async (value) => {
      const rows = await ctx.db
        .query("phaseRaciDefaults")
        .withIndex("by_phase", (q) => q.eq("phase", value))
        .collect();

      const cells = rows
        .flatMap((row) => {
          const fn = byId.get(row.functionId);
          if (fn === undefined) return [];
          if (row.roles.length === 0 && row.note === undefined) return [];
          // `functionId` lets a person picker match the matrix against the
          // directory without comparing display names.
          return [
            {
              order: fn.order,
              functionId: fn._id,
              functionName: fn.name,
              roles: row.roles,
              note: row.note,
            },
          ];
        })
        .sort((a, b) => a.order - b.order);

      return { phase: value, cells };
    }),
  );
}

/**
 * The Responsible list, whichever generation of document it is stored on.
 * Old documents carry a single `responsiblePersonId`; new writes carry the
 * `responsiblePersonIds` list and clear the legacy column. Everything that
 * reads "who is doing this?" goes through here (client twin: lib/domain.ts).
 */
export function responsiblesOf(task: Doc<"tasks">): ReadonlyArray<Id<"people">> {
  if (task.responsiblePersonIds !== undefined) return task.responsiblePersonIds;
  return task.responsiblePersonId === undefined ? [] : [task.responsiblePersonId];
}

/**
 * Stamps the Task Template (CONTEXT.md) onto a freshly created owner: the
 * default checklist for each of the tier's phases, undated and unassigned.
 * Creation-time only — template edits never reach back into existing checklists.
 */
export async function stampTemplates(
  ctx: MutationCtx,
  owner: TaskOwner,
  phases: readonly PhaseNumber[],
) {
  const wanted = new Set<PhaseNumber>(phases);
  const templates = (await ctx.db.query("taskTemplates").collect())
    .filter((template) => wanted.has(template.phase))
    .sort((a, b) => a.phase - b.phase || a.order - b.order);

  const fields = ownerFields(owner);
  for (const [index, template] of templates.entries()) {
    await ctx.db.insert("tasks", {
      ...fields,
      phase: template.phase,
      name: template.name,
      spec: template.spec,
      category: template.category,
      quantity: template.quantity,
      status: "not_started",
      responsiblePersonIds: [],
      consultedPersonIds: [],
      informedPersonIds: [],
      order: index,
    });
  }
  return templates.length;
}

/** Health counts for one checklist, used by every navigation surface. */
export type Rollup = ReturnType<typeof rollup>;

export function rollup(tasks: readonly Doc<"tasks">[], today: string) {
  let delivered = 0;
  let inProgress = 0;
  let blocked = 0;
  let notStarted = 0;
  let overdue = 0;
  let unassigned = 0;
  let missingAccountable = 0;

  for (const task of tasks) {
    if (task.status === "delivered") delivered += 1;
    else if (task.status === "in_progress") inProgress += 1;
    else if (task.status === "blocked") blocked += 1;
    else notStarted += 1;

    // Overdue is derived, never stored: past ETA and not yet delivered.
    if (isOverdue(task, today)) overdue += 1;
    if (responsiblesOf(task).length === 0) unassigned += 1;
    // The softer warning: nobody owns the outcome, even if someone is doing it.
    if (task.accountablePersonId === undefined) missingAccountable += 1;
  }

  return {
    total: tasks.length,
    delivered,
    inProgress,
    blocked,
    notStarted,
    overdue,
    unassigned,
    missingAccountable,
  };
}

/** Past ETA and not yet delivered (CONTEXT.md: Overdue). Never stored. */
export function isOverdue(task: Doc<"tasks">, today: string): boolean {
  return task.status !== "delivered" && task.eta !== undefined && task.eta < today;
}

/**
 * Where a task lives, in the shape a cross-cutting view needs: enough to name
 * the owner and to build a deep link back to the page the task is edited on.
 * The season/plan/promotion split mirrors `TaskOwner` so the client can turn a
 * place straight into a route.
 */
export type TaskPlace =
  | { tier: "season"; seasonId: Id<"seasons">; label: string; chain: string | null }
  | {
      tier: "chainPlan";
      chainPlanId: Id<"chainPlans">;
      label: string;
      chain: string | null;
    }
  | {
      tier: "promotion";
      promotionId: Id<"promotions">;
      label: string;
      chain: string | null;
    };

/** A read-through cache for one query's worth of lookups in a single table. */
function memo<Table extends TableNames>(ctx: QueryCtx) {
  const seen = new Map<Id<Table>, Doc<Table> | null>();
  return async (id: Id<Table>): Promise<Doc<Table> | null> => {
    const hit = seen.get(id);
    if (hit !== undefined) return hit;
    const doc = await ctx.db.get(id);
    seen.set(id, doc);
    return doc;
  };
}

/**
 * Resolves the owner of tasks drawn from every tier at once — the dashboard's
 * needs-attention rail, a person's workload. Owners are cached per resolver, so
 * a promotion's twelve rows cost one read, not twelve.
 */
export function placeResolver(ctx: QueryCtx) {
  const seasonOf = memo<"seasons">(ctx);
  const planOf = memo<"chainPlans">(ctx);
  const promotionOf = memo<"promotions">(ctx);
  const chainOf = memo<"chains">(ctx);

  return async function placeOf(task: Doc<"tasks">): Promise<TaskPlace> {
    const owner = ownerOf(task);
    switch (owner.tier) {
      case "promotion": {
        const promotion = await promotionOf(owner.promotionId);
        const chain = promotion === null ? null : await chainOf(promotion.chainId);
        return {
          tier: "promotion",
          promotionId: owner.promotionId,
          label: promotion?.name ?? "Deleted promotion",
          chain: chain?.name ?? null,
        };
      }
      case "chainPlan": {
        const plan = await planOf(owner.chainPlanId);
        const chain = plan === null ? null : await chainOf(plan.chainId);
        return {
          tier: "chainPlan",
          chainPlanId: owner.chainPlanId,
          label: chain === null ? "Chain plan" : `${chain.name} plan`,
          chain: chain?.name ?? null,
        };
      }
      case "season": {
        const season = await seasonOf(owner.seasonId);
        return {
          tier: "season",
          seasonId: owner.seasonId,
          label: season === null ? "Plan year" : `Year ${season.label}`,
          chain: null,
        };
      }
    }
  };
}

/**
 * The order the needs-attention rail lists work in: soonest ETA first, because
 * the thing that is latest is the thing to argue about. Tasks with no ETA sit
 * at the end — undated work cannot be late, only unowned.
 */
export function byEta(a: Doc<"tasks">, b: Doc<"tasks">) {
  if (a.eta === undefined) return b.eta === undefined ? a.order - b.order : 1;
  if (b.eta === undefined) return -1;
  return a.eta.localeCompare(b.eta);
}

/** Appends to a list: one past the current highest `order`. */
export function nextOrder(rows: readonly { order: number }[]) {
  return rows.reduce((max, row) => Math.max(max, row.order + 1), 0);
}

/** The two nudges a list row can take. */
export const moveDirection = v.union(v.literal("up"), v.literal("down"));
export type MoveDirection = Infer<typeof moveDirection>;

type Ordered = Doc<"tasks"> | Doc<"taskTemplates">;

/**
 * Nudges a row up or down by swapping `order` with its neighbour. `siblings`
 * are the rows the UI draws as one list — the caller decides that grouping and
 * may pass them in any order. A no-op at either end of the list.
 */
export async function swapOrder(
  ctx: MutationCtx,
  row: Ordered,
  siblings: readonly Ordered[],
  direction: MoveDirection,
) {
  const sorted = [...siblings].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((candidate) => candidate._id === row._id);
  if (index === -1) return;
  const swapWith = sorted[direction === "up" ? index - 1 : index + 1];
  if (swapWith === undefined) return;

  await ctx.db.patch(row._id, { order: swapWith.order });
  await ctx.db.patch(swapWith._id, { order: row.order });
}

/** Deletes a checklist wholesale — used when its owner is removed. */
export async function deleteTasks(ctx: MutationCtx, tasks: readonly Doc<"tasks">[]) {
  for (const task of tasks) await ctx.db.delete(task._id);
}
