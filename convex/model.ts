import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { phase, taskStatus } from "./schema";

// Shared domain rules for the three-tier model. Everything here is used by more
// than one function module; anything used by exactly one lives with it.

export type PhaseNumber = Infer<typeof phase>;
export type TaskStatus = Infer<typeof taskStatus>;

/**
 * What every ordinary record edit records: who touched it last, and when
 * (schema.ts: lastModified). Built once per mutation by the wrappers in
 * `access.ts` and spread into the write, so a handler cannot stamp the wrong
 * User and cannot quietly forget the timestamp.
 */
export type LastModified = { lastModifiedBy: Id<"users">; lastModifiedAt: number };

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
export const CHAIN_PLAN_PHASES = [1, 2, 3, 4] as const satisfies readonly PhaseNumber[];
export const PROMOTION_PHASES = [5, 6, 7, 8] as const satisfies readonly PhaseNumber[];
export const ALL_PHASES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
] as const satisfies readonly PhaseNumber[];

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
 * Rejects a phase that does not belong to the tier it is being written on — a
 * chain plan whose `currentPhase` is 7 labels itself with a phase that tier
 * never runs, in the nav tree and the pathway strip alike. Applies to a
 * record's own phase and to the phase of a task hung beneath it.
 */
export function assertPhaseInTier(value: PhaseNumber, tier: TaskOwner["tier"]) {
  const expected = tierForPhase(value);
  if (expected !== tier) {
    throw new ConvexError(
      `Phase ${value} belongs to ${TIER_LABEL[expected]}, not ${TIER_LABEL[tier]}.`,
    );
  }
}

/**
 * Which of the three tiers a task hangs on, read back off its own columns.
 * Null for a task attached to nothing: that document is unreachable by every
 * navigation surface, so it belongs to nobody's scope rather than everybody's.
 */
export function ownerOfTask(task: Doc<"tasks">): TaskOwner | null {
  if (task.seasonId !== undefined) {
    return { tier: "season", seasonId: task.seasonId };
  }
  if (task.chainPlanId !== undefined) {
    return { tier: "chainPlan", chainPlanId: task.chainPlanId };
  }
  if (task.promotionId !== undefined) {
    return { tier: "promotion", promotionId: task.promotionId };
  }
  return null;
}

/** The ownership columns for a task, with the two unused ones left unset. */
export function ownerFields(owner: TaskOwner) {
  return {
    seasonId: owner.tier === "season" ? owner.seasonId : undefined,
    chainPlanId: owner.tier === "chainPlan" ? owner.chainPlanId : undefined,
    promotionId: owner.tier === "promotion" ? owner.promotionId : undefined,
  };
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

/**
 * The one sentence a write hears about a record it cannot have.
 *
 * Exported because the scope checks in `access.ts` raise it too: a mutation
 * aimed at an out-of-scope id has to fail *identically* to one aimed at a
 * deleted id, or the difference between the two errors is a probe (#27,
 * scenario 15). One function, so the two can never drift apart.
 */
export function missing(label: string): never {
  throw new ConvexError(`That ${label} no longer exists.`);
}

/** Loads a document or fails loudly rather than returning a silent null. */
export async function mustGet<Table extends TableNames>(
  ctx: QueryCtx,
  id: Id<Table>,
  label: string,
): Promise<Doc<Table>> {
  const doc = await ctx.db.get(id);
  if (doc === null) missing(label);
  return doc;
}

/**
 * A chain as a Member is allowed to see it: the name that labels their plan or
 * promotion, and nothing else.
 *
 * `chains.list` is Administrator-only because the account list is
 * company-sensitive, and `chains.notes` is the negotiation context an
 * Administrator types in Manage. Every scoped read that has to name a chain
 * goes through here rather than returning the document, so the ancestor rule —
 * ancestors are names, not content — holds at the function surface and not just
 * in the views (#30, story 24).
 */
export function chainLabel(chain: Doc<"chains">) {
  return { _id: chain._id, name: chain.name };
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
  // The rows land under whoever created the owner, so a checklist nobody has
  // touched yet still answers "where did this come from?".
  stamp: LastModified,
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
      ...stamp,
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

/**
 * A read-through cache for one query's worth of lookups in a single table.
 *
 * Caches the in-flight read rather than its result, because every caller here
 * fans out over `Promise.all`: the second lookup of an id arrives long before
 * the first one resolves, and a cache of resolved docs would miss every time.
 */
export function memo<Table extends TableNames>(ctx: QueryCtx) {
  const seen = new Map<Id<Table>, Promise<Doc<Table> | null>>();
  return (id: Id<Table>): Promise<Doc<Table> | null> => {
    const hit = seen.get(id);
    if (hit !== undefined) return hit;
    const reading = ctx.db.get(id);
    seen.set(id, reading);
    return reading;
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
    if (task.promotionId !== undefined) {
      const promotion = await promotionOf(task.promotionId);
      const chain = promotion === null ? null : await chainOf(promotion.chainId);
      return {
        tier: "promotion",
        promotionId: task.promotionId,
        label: promotion?.name ?? "Deleted promotion",
        chain: chain?.name ?? null,
      };
    }
    if (task.chainPlanId !== undefined) {
      const plan = await planOf(task.chainPlanId);
      const chain = plan === null ? null : await chainOf(plan.chainId);
      return {
        tier: "chainPlan",
        chainPlanId: task.chainPlanId,
        label: chain === null ? "Chain plan" : `${chain.name} plan`,
        chain: chain?.name ?? null,
      };
    }
    if (task.seasonId !== undefined) {
      const season = await seasonOf(task.seasonId);
      return {
        tier: "season",
        seasonId: task.seasonId,
        label: season === null ? "Plan year" : `Year ${season.label}`,
        chain: null,
      };
    }
    throw new ConvexError("Task is not attached to a plan year, chain plan or promotion.");
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

/** Appends to a checklist: one past the current highest `order`. */
export function nextOrder(tasks: readonly Doc<"tasks">[]) {
  return tasks.reduce((max, task) => Math.max(max, task.order + 1), 0);
}

/** Deletes a checklist wholesale — used when its owner is removed. */
export async function deleteTasks(ctx: MutationCtx, tasks: readonly Doc<"tasks">[]) {
  for (const task of tasks) await ctx.db.delete(task._id);
}
