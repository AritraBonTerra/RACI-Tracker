import { internalMutation } from "./_generated/server";

// One-off data rewrites. Each is idempotent, so running one twice is safe.

/**
 * Folds the legacy single `responsiblePersonId` column into the
 * `responsiblePersonIds` list (CONTEXT.md: RACI — one or more Responsibles).
 * Reads already tolerate both shapes via `responsiblesOf`; this exists so the
 * legacy column can eventually be dropped from the schema.
 *
 * `bunx convex run migrations:backfillResponsibles` (add `--prod` for production)
 */
export const backfillResponsibles = internalMutation({
  args: {},
  handler: async (ctx) => {
    let rewritten = 0;
    for (const task of await ctx.db.query("tasks").collect()) {
      if (task.responsiblePersonIds !== undefined && task.responsiblePersonId === undefined) {
        continue;
      }
      await ctx.db.patch(task._id, {
        responsiblePersonIds:
          task.responsiblePersonIds ??
          (task.responsiblePersonId === undefined ? [] : [task.responsiblePersonId]),
        responsiblePersonId: undefined,
      });
      rewritten += 1;
    }
    return { rewritten };
  },
});

/** Run once before deploying the eight-phase schema. Never renumbers twice. */
export const eightPhaseWorkflow = internalMutation({
  args: {},
  handler: async (ctx) => {
    const key = "eight-phase-workflow-2026-09";
    if (
      await ctx.db
        .query("dataMigrations")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first()
    ) {
      return { changed: false };
    }
    const remap = (value: number) =>
      (value >= 4 ? value - 1 : value) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    for (const table of ["tasks", "taskTemplates"] as const) {
      const rows = (await ctx.db.query(table).collect()).sort(
        (a, b) => a.phase - b.phase || a.order - b.order,
      );
      const orders = new Map<string, number>();
      for (const row of rows) {
        const phase = remap(row.phase);
        const owner =
          "promotionId" in row && row.promotionId
            ? row.promotionId
            : "chainPlanId" in row && row.chainPlanId
              ? row.chainPlanId
              : "seasonId" in row && row.seasonId
                ? row.seasonId
                : "templates";
        const group = `${owner}:${phase}`;
        const order = orders.get(group) ?? 0;
        orders.set(group, order + 1);
        await ctx.db.patch(row._id, { phase, order });
      }
    }
    for (const table of ["chainPlans", "promotions"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.patch(row._id, { currentPhase: remap(row.currentPhase) });
      }
    }
    const defaults = (await ctx.db.query("phaseRaciDefaults").collect()).sort(
      (a, b) => a.phase - b.phase,
    );
    const merged = new Map<string, (typeof defaults)[number]>();
    for (const row of defaults) {
      const phase = remap(row.phase);
      const group = `${phase}:${row.functionId}`;
      const existing = merged.get(group);
      if (existing) {
        const roles = [...new Set([...existing.roles, ...row.roles])];
        const note =
          [
            ...new Set(
              [existing.note, row.note].filter((value): value is string => Boolean(value)),
            ),
          ].join("; ") || undefined;
        await ctx.db.patch(existing._id, { roles, note });
        merged.set(group, { ...existing, roles, note });
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { phase });
        merged.set(group, { ...row, phase });
      }
    }
    await ctx.db.insert("dataMigrations", { key, appliedAt: Date.now() });
    return { changed: true };
  },
});
