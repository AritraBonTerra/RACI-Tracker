import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { PhaseNumber } from "./model";
import {
  BRANDS,
  CELL_ROLES,
  CHAIN_PLANS,
  CHAINS,
  FUNCTIONS,
  MATRIX_NOTES,
  PEOPLE,
  type PersonKey,
  PHASE_RACI_MATRIX,
  PROMOTIONS,
  SEASON,
  type TaskRow,
  TODAY,
} from "./seedData";
import { DEFAULT_TASK_TEMPLATES } from "./templateDefaults";

// Loads the 2026 demo data set (seedData.ts). This file is only the loader:
// the order tables are written in, and how the data's keys become ids.

// Tables the seed owns end to end; ordered children-first so a clear pass never
// leaves a dangling reference *within the plan data*.
//
// The access tables (#30) are not seeded and are not cleared, and they do point
// in here: an `accessAssignments` row names a Season, Chain Plan or Promotion,
// and `users.personId` names a Person. A clear pass orphans those. That is
// deliberate — the seed must not delete accounts or the audit trail — and it is
// contained on the read side: `expandScopes` and `scopesOf` drop assignments
// whose target is gone, and the Directory shows the account as awaiting access
// and unlinked. `docs/runbooks/cutover.md` warns operators off `seed:run --prod`
// after bootstrap for exactly this reason.
const SEEDED_TABLES = [
  "tasks",
  "taskTemplates",
  // Detachable phase-7/8 feature (#14).
  "kpiEntries",
  "retros",
  "phaseRaciDefaults",
  "promotions",
  "chainPlans",
  "people",
  "functions",
  "brands",
  "seasons",
  "chains",
] as const satisfies readonly TableNames[];

// --- Insert helpers -------------------------------------------------------

/**
 * Inserts each row and returns the results keyed by the row's `key`, so later
 * seed steps can say `people.marisol` and have the compiler catch typos.
 */
async function insertKeyed<const Row extends { readonly key: string }, Inserted>(
  rows: readonly Row[],
  insert: (row: Row) => Promise<Inserted>,
): Promise<Record<Row["key"], Inserted>> {
  const entries: Array<readonly [string, Inserted]> = [];
  for (const row of rows) {
    entries.push([row.key, await insert(row)]);
  }
  // `Object.fromEntries` widens keys to `string`; the rows are the only source
  // of keys, so the narrower type is accurate.
  return Object.fromEntries(entries) as Record<Row["key"], Inserted>;
}

type PeopleIds = Record<PersonKey, Id<"people">>;

type ChecklistOwner = Pick<
  WithoutSystemFields<Doc<"tasks">>,
  "seasonId" | "chainPlanId" | "promotionId"
>;

/**
 * Attaches a phase checklist to one owner, numbering the rows as given and
 * resolving the people named by key into ids.
 */
async function insertChecklist(
  ctx: MutationCtx,
  owner: ChecklistOwner,
  rows: readonly TaskRow[],
  people: PeopleIds,
) {
  for (const [index, row] of rows.entries()) {
    const {
      responsiblePersonIds,
      accountablePersonId,
      consultedPersonIds,
      informedPersonIds,
      ...fields
    } = row;
    await ctx.db.insert("tasks", {
      ...fields,
      ...owner,
      responsiblePersonIds: (responsiblePersonIds ?? []).map((key) => people[key]),
      accountablePersonId:
        accountablePersonId === undefined ? undefined : people[accountablePersonId],
      consultedPersonIds: (consultedPersonIds ?? []).map((key) => people[key]),
      informedPersonIds: (informedPersonIds ?? []).map((key) => people[key]),
      order: index,
    });
  }
  return rows.length;
}

async function clearAll(ctx: MutationCtx) {
  let deleted = 0;
  for (const table of SEEDED_TABLES) {
    for (const doc of await ctx.db.query(table).collect()) {
      await ctx.db.delete(doc._id);
      deleted += 1;
    }
  }
  return deleted;
}

// --- Public entry points --------------------------------------------------

/** Wipes every seeded table. `bunx convex run seed:clear` */
export const clear = internalMutation({
  args: {},
  handler: async (ctx) => ({ deleted: await clearAll(ctx) }),
});

/**
 * Loads the 2026 demo data set. Idempotent by construction: it clears the
 * seeded tables first, so re-running always lands on the same state.
 *
 * `bunx convex run seed:run` (add `--prod` for the production deployment)
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const deleted = await clearAll(ctx);

    const functionIds = await insertKeyed(FUNCTIONS, (fn) => ctx.db.insert("functions", fn));
    const people = await insertKeyed(PEOPLE, (person) =>
      ctx.db.insert("people", {
        name: person.name,
        functionId: functionIds[person.fn],
        title: person.title,
        organization: person.organization,
      }),
    );
    const chains = await insertKeyed(CHAINS, (chain) =>
      ctx.db.insert("chains", { name: chain.name }),
    );
    const brands = await insertKeyed(BRANDS, (brand) =>
      ctx.db.insert("brands", {
        name: brand.name,
        isPlaceholder: true,
        notes: brand.notes,
      }),
    );

    // Phase-default matrix.
    let matrixRows = 0;
    for (const row of PHASE_RACI_MATRIX) {
      for (const fn of FUNCTIONS) {
        const note = MATRIX_NOTES.find(
          (candidate) => candidate.phase === row.phase && candidate.fn === fn.key,
        )?.note;
        await ctx.db.insert("phaseRaciDefaults", {
          phase: row.phase,
          functionId: functionIds[fn.key],
          roles: [...CELL_ROLES[row[fn.key]]],
          note,
        });
        matrixRows += 1;
      }
    }

    // The Task Template: the same default menu `taskTemplates:loadDefaults`
    // offers a fresh deployment, so new plans stamp the deck's checklist.
    {
      const perPhase = new Map<PhaseNumber, number>();
      for (const row of DEFAULT_TASK_TEMPLATES) {
        const order = perPhase.get(row.phase) ?? 0;
        perPhase.set(row.phase, order + 1);
        await ctx.db.insert("taskTemplates", { ...row, order });
      }
    }

    // The tree: season -> chain plans -> promotions, each with its checklist.
    const { tasks: seasonTasks, ...season } = SEASON;
    const seasonId = await ctx.db.insert("seasons", season);
    let taskCount = await insertChecklist(ctx, { seasonId }, seasonTasks, people);

    const plans = await insertKeyed(CHAIN_PLANS, async (plan) => {
      const chainId = chains[plan.chain];
      const _id = await ctx.db.insert("chainPlans", {
        seasonId,
        chainId,
        currentPhase: plan.currentPhase,
        jbpDate: plan.jbpDate,
        notes: plan.notes,
      });
      return { _id, chainId };
    });
    for (const plan of CHAIN_PLANS) {
      taskCount += await insertChecklist(
        ctx,
        { chainPlanId: plans[plan.key]._id },
        plan.tasks,
        people,
      );
    }

    let kpiEntries = 0;
    let retros = 0;
    for (const { chainPlan, brandIds, tasks, kpis, retro, ...fields } of PROMOTIONS) {
      const plan = plans[chainPlan];
      const promotionId = await ctx.db.insert("promotions", {
        ...fields,
        chainPlanId: plan._id,
        // Copied from the plan, as promotions.create does (schema.ts: promotions).
        chainId: plan.chainId,
        seasonId,
        brandIds: brandIds.map((key) => brands[key]),
      });

      // Detachable phase-7/8 feature (#14).
      for (const entry of kpis ?? []) {
        await ctx.db.insert("kpiEntries", { promotionId, ...entry });
        kpiEntries += 1;
      }
      if (retro !== undefined) {
        await ctx.db.insert("retros", { promotionId, ...retro });
        retros += 1;
      }

      taskCount += await insertChecklist(ctx, { promotionId }, tasks, people);
    }

    return {
      today: TODAY,
      deletedBeforeSeed: deleted,
      taskTemplates: DEFAULT_TASK_TEMPLATES.length,
      seasons: 1,
      chains: CHAINS.length,
      brands: BRANDS.length,
      functions: FUNCTIONS.length,
      people: PEOPLE.length,
      chainPlans: CHAIN_PLANS.length,
      promotions: PROMOTIONS.length,
      phaseRaciDefaults: matrixRows,
      tasks: taskCount,
      kpiEntries,
      retros,
    };
  },
});
