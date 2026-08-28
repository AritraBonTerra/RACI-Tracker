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
