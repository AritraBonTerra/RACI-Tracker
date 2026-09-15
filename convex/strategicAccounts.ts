import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  CHAIN_PLAN_PHASES,
  ownerFields,
  type PhaseNumber,
  responsiblesOf,
  SEASON_PHASES,
  type TaskOwner,
} from "./model";

// The real account list: Strategic Accounts Channel 2 (Off Premise), from the
// org slide of 2026-09-14. One Person per account manager, one Chain per
// account they own, and the 2026 plan year with every chain's plan opened and
// its phase 0-3 work pre-marked delivered — 2026 is a promotions-only year.
//
// The manager -> chain mapping is recorded on each chain's notes, because the
// Access Assignment that makes it real needs a User, and a User exists only
// after its first sign-in. Onboarding a manager is then: Directory -> their
// account -> Editor -> one Chain grant per chain listed here (ADR 0004).

/** The Function every account manager belongs to (seedData.ts: FUNCTIONS). */
const FUNCTION_KEY = "commercial";

/**
 * The stand-in owner for work nobody will actually do this year. Named so it
 * reads as a placeholder on every checklist it appears on, and easy to replace
 * once the real 2027 owners are named.
 */
const PLACEHOLDER = {
  name: "Admin (placeholder)",
  title: "Placeholder owner of pre-marked 2026 phase 0–3 work",
} as const;

const ORGANIZATION = "Bonterra Organic Estates";

const ACCOUNT_MANAGERS = [
  {
    name: "Alisa Thompson",
    title: "Strategic Accounts Lead, Off Premise",
    chains: ["Costco", "Publix", "SEG"],
  },
  {
    name: "Adam Szabo",
    title: "Strategic Account Manager",
    chains: ["Kroger", "Walgreens", "ABC Liquors"],
  },
  {
    name: "Travis Nuckolls",
    title: "Strategic Account Manager",
    chains: ["Walmart", "Sam's Club", "Target"],
  },
  {
    name: "Chris Dorer",
    title: "Strategic Account Manager",
    chains: [
      "Total Wine",
      "Harris Teeter",
      "Food Lion",
      "Ingles",
      "Giant/Landover",
      "Jewel Osco",
      "The Fresh Market",
      "Schnucks",
      "Safeway – Eastern Div",
      "Meijer",
      "Lowes Foods",
      "SpartanNash",
      "Hy-Vee",
      "BJ's",
      "Aldi",
    ],
  },
  {
    name: "Mike Connolly",
    title: "Strategic Account Manager",
    chains: [
      "Giant/Martin's",
      "Market Basket",
      "Giant Eagle",
      "Hannaford",
      "Weis Markets",
      "Acme Markets",
      "Shaw's",
      "Stop & Shop",
      "Price Chopper",
      "Wegmans",
    ],
  },
  {
    name: "Jessica Itz",
    title: "Strategic Account Manager",
    chains: [
      "HEB",
      "Albertsons/Randalls/Tom Thumb",
      "Spec's Liquor",
      "ALB United",
      "Rouses",
      "Western Beverage (TX)",
      "Twin Liquors",
    ],
  },
  {
    name: "Travis Townes",
    title: "Strategic Account Manager",
    chains: [
      "Whole Foods",
      "Sprouts",
      "WinCo",
      "Albertsons/Vons/Pavilions",
      "Safeway/Albertsons – Southwest Div",
      "Safeway Pac NW (Portland/Seattle)",
      "ABSCO So Cal",
      "Bashas'",
      "Albertsons – Intermountain",
      "Haggen",
      "Trader Joe's",
      "CVS",
    ],
  },
] as const;

const YEAR = 2026;

// --- Helpers ----------------------------------------------------------------

async function functionByKey(ctx: MutationCtx, key: string): Promise<Doc<"functions">> {
  const fn = (await ctx.db.query("functions").collect()).find((row) => row.key === key);
  if (fn === undefined) throw new Error(`Function "${key}" is missing — run the seed first.`);
  return fn;
}

/** Finds a Person by exact name or creates them. People carry no name index; the table is small. */
async function ensurePerson(
  ctx: MutationCtx,
  people: Doc<"people">[],
  person: { name: string; title: string; functionId: Id<"functions"> },
): Promise<{ id: Id<"people">; created: boolean }> {
  const existing = people.find((row) => row.name === person.name);
  if (existing !== undefined) return { id: existing._id, created: false };
  const id = await ctx.db.insert("people", { ...person, organization: ORGANIZATION });
  return { id, created: true };
}

async function ensureChain(
  ctx: MutationCtx,
  name: string,
  notes: string,
): Promise<{ id: Id<"chains">; created: boolean }> {
  const existing = await ctx.db
    .query("chains")
    .withIndex("by_name", (q) => q.eq("name", name))
    .first();
  if (existing !== null) return { id: existing._id, created: false };
  return { id: await ctx.db.insert("chains", { name, notes }), created: true };
}

/**
 * The owner's template checklist, written already finished: every row handed
 * to the placeholder as Responsible and Accountable and marked delivered. The
 * year's phase 0-3 work is declared done so the tool's red states stay
 * meaningful for the promotions that are actually being run. Same rows
 * `stampTemplates` (model.ts) would write, minus the round trip through
 * "not started"; no last-modified stamp, because no User made this edit.
 */
async function stampDelivered(
  ctx: MutationCtx,
  owner: TaskOwner,
  templates: readonly Doc<"taskTemplates">[],
  placeholder: Id<"people">,
) {
  const phases: readonly PhaseNumber[] =
    owner.tier === "season" ? SEASON_PHASES : CHAIN_PLAN_PHASES;
  const rows = templates
    .filter((template) => phases.includes(template.phase))
    .sort((a, b) => a.phase - b.phase || a.order - b.order);
  const fields = ownerFields(owner);
  for (const [index, template] of rows.entries()) {
    await ctx.db.insert("tasks", {
      ...fields,
      phase: template.phase,
      name: template.name,
      spec: template.spec,
      category: template.category,
      quantity: template.quantity,
      status: "delivered",
      responsiblePersonIds: [placeholder],
      accountablePersonId: placeholder,
      consultedPersonIds: [],
      informedPersonIds: [],
      order: index,
    });
  }
  return rows.length;
}

/**
 * A template row exactly as `stampTemplates` wrote it: nobody's, not started.
 * Anything else — an owner, a status, a blocked reason — is somebody's work,
 * and the loader converges a checklist opened in the app, it never overwrites.
 */
function untouched(task: Doc<"tasks">) {
  return (
    responsiblesOf(task).length === 0 &&
    task.accountablePersonId === undefined &&
    task.status === "not_started"
  );
}

/**
 * No User made the loader's edits, so a row it rewrites drops the stamp of
 * whoever opened the checklist rather than crediting them with the change.
 */
const UNSTAMPED = { lastModifiedBy: undefined, lastModifiedAt: undefined };

/** Hands untouched rows to the placeholder, delivered, and reports how many. */
async function adoptUntouched(
  ctx: MutationCtx,
  tasks: readonly Doc<"tasks">[],
  placeholder: Id<"people">,
) {
  const rows = tasks.filter(untouched);
  for (const task of rows) {
    await ctx.db.patch(task._id, {
      ...UNSTAMPED,
      responsiblePersonIds: [placeholder],
      responsiblePersonId: undefined,
      accountablePersonId: placeholder,
      status: "delivered",
      blockedReason: undefined,
    });
  }
  return rows.length;
}

// --- Entry point ------------------------------------------------------------

/**
 * Loads the strategic-accounts world. Idempotent and resumable: every row is
 * looked up by name or year before it is written, and chain plans are opened
 * `batch` at a time so one call stays well inside a transaction. Re-run until
 * `remaining` is 0:
 *
 *   bunx convex run strategicAccounts:seed2026 --deployment <name>
 */
export const seed2026 = internalMutation({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const batch = args.batch ?? 8;
    const fn = await functionByKey(ctx, FUNCTION_KEY);
    const people = await ctx.db.query("people").collect();
    const templates = await ctx.db.query("taskTemplates").collect();

    let peopleCreated = 0;
    const placeholder = await ensurePerson(ctx, people, { ...PLACEHOLDER, functionId: fn._id });
    if (placeholder.created) peopleCreated += 1;
    for (const manager of ACCOUNT_MANAGERS) {
      const person = await ensurePerson(ctx, people, {
        name: manager.name,
        title: manager.title,
        functionId: fn._id,
      });
      if (person.created) peopleCreated += 1;
    }

    let chainsCreated = 0;
    const chainIds: Id<"chains">[] = [];
    for (const manager of ACCOUNT_MANAGERS) {
      for (const name of manager.chains) {
        const chain = await ensureChain(ctx, name, `Strategic account manager: ${manager.name}`);
        if (chain.created) chainsCreated += 1;
        chainIds.push(chain.id);
      }
    }

    let seasonCreated = false;
    let season = await ctx.db
      .query("seasons")
      .withIndex("by_year", (q) => q.eq("year", YEAR))
      .first();
    if (season === null) {
      const seasonId = await ctx.db.insert("seasons", {
        year: YEAR,
        label: String(YEAR),
        notes:
          "Promotions-only year. Phase 0 and every chain's phases 1–3 were pre-marked delivered under the placeholder owner so the team could start on phases 4–7.",
      });
      await stampDelivered(ctx, { tier: "season", seasonId }, templates, placeholder.id);
      season = await ctx.db.get(seasonId);
      seasonCreated = true;
    }
    if (season === null) throw new Error("Season vanished mid-run.");
    const seasonId = season._id;

    // The year may have been opened in the app before this ran. Untouched
    // phase-0 rows are the placeholder's too, and done: the year is a
    // promotions-only year whichever door it came in by.
    const seasonTasksAdopted = await adoptUntouched(
      ctx,
      await ctx.db
        .query("tasks")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      placeholder.id,
    );

    // Opening a plan and converging one an Editor opened first both count
    // against `batch`: either is a checklist's worth of writes.
    let plansCreated = 0;
    let plansConverged = 0;
    let planTasksAdopted = 0;
    let remaining = 0;
    for (const chainId of chainIds) {
      const existing = await ctx.db
        .query("chainPlans")
        .withIndex("by_season_and_chain", (q) => q.eq("seasonId", seasonId).eq("chainId", chainId))
        .first();
      if (existing !== null) {
        // Same convergence as the year: untouched phase 1-3 rows are
        // delivered, and the plan stands at phase 3 like the ones this loader
        // opens. A plan already there costs nothing and is not a unit of work.
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_chain_plan", (q) => q.eq("chainPlanId", existing._id))
          .collect();
        if (existing.currentPhase >= 3 && !tasks.some(untouched)) continue;
        if (plansCreated + plansConverged >= batch) {
          remaining += 1;
          continue;
        }
        planTasksAdopted += await adoptUntouched(ctx, tasks, placeholder.id);
        if (existing.currentPhase < 3) {
          await ctx.db.patch(existing._id, { ...UNSTAMPED, currentPhase: 3 });
        }
        plansConverged += 1;
        continue;
      }
      if (plansCreated + plansConverged >= batch) {
        remaining += 1;
        continue;
      }
      // Phase 3 (agreement) is the last chain-plan phase: the plan is "done".
      const chainPlanId = await ctx.db.insert("chainPlans", { seasonId, chainId, currentPhase: 3 });
      await stampDelivered(ctx, { tier: "chainPlan", chainPlanId }, templates, placeholder.id);
      plansCreated += 1;
    }

    return {
      peopleCreated,
      chainsCreated,
      seasonCreated,
      seasonTasksAdopted,
      plansCreated,
      plansConverged,
      planTasksAdopted,
      remaining,
    };
  },
});
