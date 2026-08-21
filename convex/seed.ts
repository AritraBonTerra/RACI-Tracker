import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { WithoutSystemFields } from "convex/server";
import type { Infer } from "convex/values";
import { phase, raciRole } from "./schema";

// Demo data for the 2026 season. Every date below is fixed rather than computed
// from `Date.now()` so a reseed always produces the same dashboard: "today" for
// this data set is 2026-08-20, and anything with an earlier ETA that is not
// delivered is meant to read as overdue.
const TODAY = "2026-08-20";

type PhaseNumber = Infer<typeof phase>;
type RaciRole = Infer<typeof raciRole>;
type TaskFields = WithoutSystemFields<Doc<"tasks">>;

// Tables the seed owns end to end; ordered children-first so a clear pass never
// leaves a dangling reference behind.
const SEEDED_TABLES = [
  "tasks",
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

// --- Reference data -------------------------------------------------------

const FUNCTIONS = [
  {
    key: "commercial",
    name: "Commercial Strat Account",
    kind: "internal",
    order: 0,
  },
  { key: "marketing", name: "Marketing", kind: "internal", order: 1 },
  {
    key: "retail",
    name: "Retail Marketing / Local Sales",
    kind: "internal",
    order: 2,
  },
  { key: "finance", name: "Finance", kind: "internal", order: 3 },
  { key: "distributor", name: "Distributor", kind: "external", order: 4 },
  { key: "buyer", name: "Buyer", kind: "external", order: 5 },
] as const satisfies readonly WithoutSystemFields<Doc<"functions">>[];

type FunctionKey = (typeof FUNCTIONS)[number]["key"];

// Every RACI cell the slide-16 grid actually uses. Spelling the cells out as a
// lookup keeps the matrix below readable as a grid while staying type-checked —
// a typo like "X" or "R/A" fails to compile instead of seeding garbage.
const CELL_ROLES = {
  "-": [],
  R: ["responsible"],
  A: ["accountable"],
  C: ["consulted"],
  I: ["informed"],
  "A/R": ["accountable", "responsible"],
  "C/R": ["consulted", "responsible"],
} as const satisfies Record<string, readonly RaciRole[]>;

type Cell = keyof typeof CELL_ROLES;

// Slide 16 of the 2026 Integrated Commercial Process deck: which function plays
// which role by default, per phase. These are defaults only — a task is assigned
// when a *named person* is Responsible, never because their function is R here.
// Seeded as data so the matrix stays editable in-app.
const PHASE_RACI_MATRIX = [
  {
    phase: 0,
    commercial: "A",
    marketing: "R",
    retail: "C",
    finance: "R",
    distributor: "I",
    buyer: "-",
  },
  {
    phase: 1,
    commercial: "A/R",
    marketing: "R",
    retail: "R",
    finance: "R",
    distributor: "I",
    buyer: "-",
  },
  {
    phase: 2,
    commercial: "A/R",
    marketing: "I",
    retail: "C",
    finance: "C",
    distributor: "R",
    buyer: "-",
  },
  {
    phase: 3,
    commercial: "A/R",
    marketing: "C",
    retail: "C",
    finance: "C",
    distributor: "C/R",
    buyer: "-",
  },
  {
    phase: 4,
    commercial: "A/R",
    marketing: "I",
    retail: "I",
    finance: "R",
    distributor: "C",
    buyer: "C",
  },
  {
    phase: 5,
    commercial: "R",
    marketing: "R",
    retail: "A/R",
    finance: "C",
    distributor: "C",
    buyer: "I",
  },
  {
    phase: 6,
    commercial: "A",
    marketing: "I",
    retail: "R",
    finance: "I",
    distributor: "R",
    buyer: "I",
  },
  {
    phase: 7,
    commercial: "R",
    marketing: "C",
    retail: "C",
    finance: "A/R",
    distributor: "C",
    buyer: "I",
  },
  {
    phase: 8,
    commercial: "A/R",
    marketing: "C",
    retail: "C",
    finance: "R",
    distributor: "C",
    buyer: "C",
  },
] as const satisfies readonly ({ phase: PhaseNumber } & Record<
  FunctionKey,
  Cell
>)[];

// Cells the four letters cannot express. The deck's phase-3 buyer cell reads
// "Decision": the buyer is not on our RACI, they are the one saying yes or no.
const MATRIX_NOTES: ReadonlyArray<{
  phase: PhaseNumber;
  fn: FunctionKey;
  note: string;
}> = [
  {
    phase: 3,
    fn: "buyer",
    note: 'Deck cell reads "Decision" — the buyer decides, rather than holding a RACI role.',
  },
];

const CHAINS = [
  { key: "safeway", name: "Safeway" },
  { key: "albertsons", name: "Albertsons" },
  { key: "ralphs", name: "Ralphs" },
  { key: "kroger", name: "Kroger" },
] as const;

// Placeholder portfolio until the real brand list is loaded.
const BRANDS = [
  { key: "fetzer", name: "Fetzer", notes: "Placeholder — core brand" },
  {
    key: "mendocino",
    name: "Mendocino line",
    notes: "Placeholder — line extension family",
  },
  { key: "bonterra", name: "Bonterra", notes: "Placeholder — organic tier" },
  {
    key: "thousandStories",
    name: "1000 Stories",
    notes: "Placeholder — premium tier",
  },
] as const;

// Fictional stand-ins for the real org chart, two per internal function and two
// each on the external side.
const PEOPLE = [
  {
    key: "marisol",
    name: "Marisol Vega",
    fn: "commercial",
    title: "Director, Key Accounts West",
    organization: "VCT USA",
  },
  {
    key: "devin",
    name: "Devin Okafor",
    fn: "commercial",
    title: "Chain Account Manager",
    organization: "VCT USA",
  },
  {
    key: "priya",
    name: "Priya Raghunathan",
    fn: "marketing",
    title: "Brand Manager, Fetzer",
    organization: "VCT USA",
  },
  {
    key: "tom",
    name: "Tom Brennan",
    fn: "marketing",
    title: "Shopper Marketing Manager",
    organization: "VCT USA",
  },
  {
    key: "alicia",
    name: "Alicia Contreras",
    fn: "retail",
    title: "Retail Marketing Lead, West",
    organization: "VCT USA",
  },
  {
    key: "jordan",
    name: "Jordan Whitfield",
    fn: "retail",
    title: "Local Sales Manager, NorCal",
    organization: "VCT USA",
  },
  {
    key: "hana",
    name: "Hana Sato",
    fn: "finance",
    title: "Commercial Finance Manager",
    organization: "VCT USA",
  },
  {
    key: "wes",
    name: "Wes Aldana",
    fn: "finance",
    title: "BI Analyst",
    organization: "VCT USA",
  },
  {
    key: "ray",
    name: "Ray Delgado",
    fn: "distributor",
    title: "Key Account Manager",
    organization: "Pacific Crest Distributing",
  },
  {
    key: "bianca",
    name: "Bianca Ferrell",
    fn: "distributor",
    title: "Field Sales Supervisor",
    organization: "Pacific Crest Distributing",
  },
  {
    key: "ken",
    name: "Ken Ishihara",
    fn: "buyer",
    title: "Category Buyer, Wine",
    organization: "Safeway",
  },
  {
    key: "gloria",
    name: "Gloria Mancini",
    fn: "buyer",
    title: "Category Manager, Beverage Alcohol",
    organization: "Kroger",
  },
] as const satisfies readonly {
  key: string;
  name: string;
  fn: FunctionKey;
  title: string;
  organization: string;
}[];

// --- Phase 7-8 measurement (detachable feature, #14) ----------------------

// The finished promotion's numbers: a 45-store, six-week Rosé feature that
// worked. Baseline is the six weeks before the window, so $/store/wk lines up
// with POS divided by 45 stores and 6 weeks — a demo where the figures do not
// reconcile invites the wrong conversation.
const SUMMER_ROSE_KPIS = [
  {
    metric: "depletions",
    baseline: 1240,
    promotional: 1980,
    note: "9L cases into Albertsons DCs, Mendocino + Bonterra combined.",
  },
  {
    metric: "pos",
    baseline: 168400,
    promotional: 261900,
    note: "Circana scan, 45 stores, six weeks either side of the window.",
  },
  {
    metric: "cwd",
    baseline: 62,
    promotional: 88,
    note: "Four stores never built the display, so 88% is the ceiling we hit.",
  },
  { metric: "dollars_per_store_week", baseline: 623.7, promotional: 970 },
  {
    metric: "investment",
    promotional: 18400,
    upliftOverride: "$1.62 margin per $1 spent",
    note: "Scan-back at $1.50/bottle plus display fees. Baseline spend was zero, so the return is the honest read, not a difference.",
  },
] as const satisfies readonly Omit<
  WithoutSystemFields<Doc<"kpiEntries">>,
  "promotionId"
>[];

const SUMMER_ROSE_RETRO = {
  worked:
    "The quarter-pallet at the head of the wine aisle. 41 of 45 stores had it built in week one, and rate of sale went from $624 to $970 per store per week — the best summer number the account has posted.",
  didntWork:
    "The four stores that never built it, and the fact that nobody noticed until the audit. Depletion data also landed three weeks after the window closed, so there was no chance to react mid-flight.",
  repeatNextYear: "yes",
  notes:
    "Repeat in 2027 with the same six-week window, but pull POS weekly instead of at the end, and hold the distributor to a build photo in week one. Feed the $970 rate of sale into next season's phase-0 targets.",
} as const satisfies Omit<WithoutSystemFields<Doc<"retros">>, "promotionId">;

// --- Insert helpers -------------------------------------------------------

/**
 * Inserts each row and returns the new ids keyed by the row's `key`, so later
 * seed steps can say `people.marisol` and have the compiler catch typos.
 */
async function insertKeyed<
  const Row extends { readonly key: string },
  Inserted,
>(
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

// A checklist row: everything a task carries except who owns it and where it
// sits in the list, both of which `insertChecklist` fills in.
type TaskSeed = Omit<
  TaskFields,
  | "seasonId"
  | "chainPlanId"
  | "promotionId"
  | "order"
  | "consultedPersonIds"
  | "informedPersonIds"
> & {
  consultedPersonIds?: Array<Id<"people">>;
  informedPersonIds?: Array<Id<"people">>;
};

type ChecklistOwner = Pick<
  TaskFields,
  "seasonId" | "chainPlanId" | "promotionId"
>;

/** Attaches a phase checklist to one owner, numbering the rows as given. */
async function insertChecklist(
  ctx: MutationCtx,
  owner: ChecklistOwner,
  rows: readonly TaskSeed[],
) {
  for (const [index, row] of rows.entries()) {
    await ctx.db.insert("tasks", {
      consultedPersonIds: [],
      informedPersonIds: [],
      ...row,
      ...owner,
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

    const functionIds = await insertKeyed(FUNCTIONS, (fn) =>
      ctx.db.insert("functions", fn),
    );
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

    // --- Season (phase 0) ---------------------------------------------------

    const seasonId = await ctx.db.insert("seasons", {
      year: 2026,
      label: "2026",
      notes:
        "Company strategic foundation for the 2026 Integrated Commercial Cycle.",
    });

    let taskCount = await insertChecklist(
      ctx,
      { seasonId },
      [
        {
          phase: 0,
          name: "Volume & value targets by chain",
          spec: "AOP targets, 9L cases and net revenue",
          eta: "2026-01-31",
          status: "delivered",
          deliveredTo: "Leadership team",
          proofOfExecution: "AOP deck v4, approved 2026-01-29",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
          consultedPersonIds: [people.hana],
        },
        {
          phase: 0,
          name: "Portfolio priorities by brand",
          spec: "Focus SKUs and innovation slots",
          eta: "2026-02-15",
          status: "delivered",
          deliveredTo: "Commercial + Marketing",
          responsiblePersonId: people.priya,
          accountablePersonId: people.marisol,
        },
        {
          phase: 0,
          name: "2026 brand activity calendar",
          spec: "National calendar, by brand and month",
          eta: "2026-08-01",
          // Overdue: past ETA, still open.
          status: "in_progress",
          responsiblePersonId: people.tom,
          accountablePersonId: people.marisol,
          consultedPersonIds: [people.alicia],
          notes: "Waiting on Q4 innovation ship dates before it can be locked.",
        },
        {
          phase: 0,
          name: "Trade spend budget envelope",
          spec: "By chain, with pricing guardrails",
          eta: "2026-02-28",
          status: "delivered",
          responsiblePersonId: people.hana,
          accountablePersonId: people.marisol,
        },
        {
          phase: 0,
          name: "Channel investment split (on/off premise)",
          eta: "2026-03-31",
          // Overdue and unassigned: nobody named as Responsible.
          status: "not_started",
          accountablePersonId: people.marisol,
          notes: "Nobody picked this up after the finance reorg.",
        },
      ],
    );

    // --- Chain plans (phases 1-4) ------------------------------------------

    const safewayPlanId = await ctx.db.insert("chainPlans", {
      seasonId,
      chainId: chains.safeway,
      currentPhase: 4,
      jbpDate: "2026-06-10",
      notes: "Terms agreed; Q4 programs now in activation.",
    });

    taskCount += await insertChecklist(
      ctx,
      { chainPlanId: safewayPlanId },
      [
        {
          phase: 1,
          name: "Internal JBP brief",
          spec: "Reason to exist, right to win, negotiation range",
          eta: "2026-04-24",
          status: "delivered",
          responsiblePersonId: people.marisol,
          accountablePersonId: people.marisol,
          consultedPersonIds: [people.priya, people.hana],
        },
        {
          phase: 2,
          name: "Joint distributor plan",
          spec: "Goals, incentives, who leads the buyer meeting",
          eta: "2026-05-15",
          status: "delivered",
          responsiblePersonId: people.ray,
          accountablePersonId: people.marisol,
        },
        {
          phase: 3,
          name: "JBP presentation & the ask",
          spec: "Items, shelf, pricing, promo calendar",
          eta: "2026-06-10",
          status: "delivered",
          deliveredTo: "Ken Ishihara (Safeway)",
          responsiblePersonId: people.marisol,
          accountablePersonId: people.marisol,
          informedPersonIds: [people.ken],
        },
        {
          phase: 4,
          name: "Document & book agreed terms",
          spec: "Scan-back schedule, off-invoice, program calendar",
          eta: "2026-06-26",
          status: "delivered",
          responsiblePersonId: people.hana,
          accountablePersonId: people.marisol,
        },
        {
          phase: 4,
          name: "Confirm distributor readiness",
          spec: "Inventory build, allocation, delivery windows for Q4 programs",
          eta: "2026-07-24",
          // Overdue, and the upstream cause of the blocked Halloween 3-case.
          status: "in_progress",
          responsiblePersonId: people.ray,
          accountablePersonId: people.marisol,
          notes:
            "Allocation for the Halloween 3-case never got confirmed in writing.",
        },
        {
          phase: 4,
          name: "State ABC compliance review",
          spec: "CA pricing and POS rules for Q4 programs",
          eta: "2026-09-04",
          // Unassigned: a compliance task with no named owner.
          status: "not_started",
          accountablePersonId: people.marisol,
        },
      ],
    );

    const ralphsPlanId = await ctx.db.insert("chainPlans", {
      seasonId,
      chainId: chains.ralphs,
      currentPhase: 4,
      jbpDate: "2026-05-20",
      notes: "Agreement finalized; summer and back-to-school programs running.",
    });

    taskCount += await insertChecklist(
      ctx,
      { chainPlanId: ralphsPlanId },
      [
        {
          phase: 1,
          name: "Internal JBP brief",
          eta: "2026-04-03",
          status: "delivered",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
        },
        {
          phase: 2,
          name: "Distributor capability check",
          spec: "Delivery windows, MOQs, warehouse allocation",
          eta: "2026-04-17",
          status: "delivered",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.marisol,
        },
        {
          phase: 3,
          name: "JBP presentation & the ask",
          eta: "2026-05-20",
          status: "delivered",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
        },
        {
          phase: 4,
          name: "Document & book agreed terms",
          eta: "2026-06-05",
          status: "delivered",
          responsiblePersonId: people.hana,
          accountablePersonId: people.marisol,
        },
      ],
    );

    const albertsonsPlanId = await ctx.db.insert("chainPlans", {
      seasonId,
      chainId: chains.albertsons,
      currentPhase: 4,
      jbpDate: "2026-03-11",
      notes: "First-half programs complete; second-half calendar being reopened.",
    });

    taskCount += await insertChecklist(
      ctx,
      { chainPlanId: albertsonsPlanId },
      [
        {
          phase: 1,
          name: "Internal JBP brief",
          eta: "2026-01-30",
          status: "delivered",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
        },
        {
          phase: 3,
          name: "JBP presentation & the ask",
          eta: "2026-03-11",
          status: "delivered",
          responsiblePersonId: people.marisol,
          accountablePersonId: people.marisol,
          informedPersonIds: [people.priya],
        },
        {
          phase: 4,
          name: "H2 calendar amendment",
          spec: "Add a holiday gifting window to the agreed calendar",
          eta: "2026-08-14",
          // Overdue and unassigned.
          status: "not_started",
        },
      ],
    );

    // Kroger sits mid-cycle: distributor alignment done-ish, buyer meeting ahead.
    const krogerPlanId = await ctx.db.insert("chainPlans", {
      seasonId,
      chainId: chains.kroger,
      currentPhase: 3,
      jbpDate: "2026-09-15",
      notes:
        "Mid-cycle: JBP on 2026-09-15. No promotions exist until terms are agreed.",
    });

    taskCount += await insertChecklist(
      ctx,
      { chainPlanId: krogerPlanId },
      [
        {
          phase: 1,
          name: "Reason to exist & right to win",
          spec: "Kroger banner-level share and category story",
          eta: "2026-07-10",
          status: "delivered",
          responsiblePersonId: people.marisol,
          accountablePersonId: people.marisol,
        },
        {
          phase: 1,
          name: "Spend envelope & pricing guardrails",
          eta: "2026-07-17",
          status: "delivered",
          responsiblePersonId: people.hana,
          accountablePersonId: people.marisol,
        },
        {
          phase: 1,
          name: "Shopper program menu for Kroger profile",
          spec: "Which mechanics fit the banner",
          eta: "2026-08-07",
          // Overdue.
          status: "in_progress",
          responsiblePersonId: people.alicia,
          accountablePersonId: people.marisol,
        },
        {
          phase: 2,
          name: "Distributor capability check",
          spec: "Warehouse allocation for a 120-store display program",
          eta: "2026-08-14",
          status: "blocked",
          blockedReason: "no inventory at distributor",
          responsiblePersonId: people.ray,
          accountablePersonId: people.marisol,
          notes:
            "Same failure mode as the paid Kroger demo: the program was sized before allocation was confirmed.",
        },
        {
          phase: 2,
          name: "Distributor incentive structure",
          spec: "Rep incentives tied to CWD targets",
          eta: "2026-08-28",
          status: "in_progress",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.marisol,
        },
        {
          phase: 3,
          name: "Business review & category story deck",
          eta: "2026-09-04",
          status: "in_progress",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
          consultedPersonIds: [people.priya],
        },
        {
          phase: 3,
          name: "The offer: trade spend & shopper programs",
          spec: "Scan-back vs. off-invoice options for the buyer meeting",
          eta: "2026-09-08",
          // Unassigned a week before the buyer meeting.
          status: "not_started",
          accountablePersonId: people.marisol,
          informedPersonIds: [people.gloria],
        },
        {
          phase: 3,
          name: "Negotiation range sign-off",
          eta: "2026-09-11",
          // Unassigned.
          status: "not_started",
        },
      ],
    );

    // --- Promotions (phases 5-8) -------------------------------------------

    // The headline demo: slide 11's activation checklist, mid-flight and messy.
    const halloweenId = await ctx.db.insert("promotions", {
      chainPlanId: safewayPlanId,
      chainId: chains.safeway,
      seasonId,
      name: "Safeway Halloween Demo Program",
      brandIds: [brands.fetzer, brands.mendocino],
      startDate: "2026-10-05",
      endDate: "2026-11-01",
      storeCount: 20,
      currentPhase: 5,
      notes: "20-store demo program with in-store sampling on October weekends.",
    });

    taskCount += await insertChecklist(
      ctx,
      { promotionId: halloweenId },
      [
        {
          phase: 5,
          category: "Stores list",
          name: "Stores list",
          spec: "20 stores, NorCal high-index wine doors",
          quantity: 20,
          eta: "2026-08-15",
          // Overdue: everything downstream is sized off this list.
          status: "in_progress",
          responsiblePersonId: people.alicia,
          accountablePersonId: people.alicia,
          consultedPersonIds: [people.ray],
          notes: "16 of 20 confirmed; buyer still to approve the last four.",
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Shelf talkers",
          spec: "32 in, Halloween creative",
          quantity: 400,
          eta: "2026-09-05",
          // Unassigned: no named Responsible.
          status: "not_started",
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Displays",
          spec: "Half-pallet, Halloween wrap",
          quantity: 20,
          eta: "2026-09-12",
          status: "in_progress",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "3 case",
          spec: "3-case stack, $9.99 feature price",
          quantity: 20,
          eta: "2026-08-10",
          // The failure the tool exists to prevent: blocked and overdue.
          status: "blocked",
          blockedReason: "no inventory at distributor",
          responsiblePersonId: people.ray,
          accountablePersonId: people.marisol,
          consultedPersonIds: [people.bianca],
          notes:
            "Allocation was never confirmed in phase 4; stacks cannot be built without stock in the warehouse.",
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Cold box",
          spec: "4 facings, Mendocino Rosé",
          quantity: 12,
          eta: "2026-09-19",
          status: "not_started",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Secondary placement",
          spec: "Produce department cross-merch bin",
          quantity: 20,
          eta: "2026-09-26",
          // Unassigned.
          status: "not_started",
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Features",
          spec: "2 ad features, weeks of 10/12 and 10/26",
          quantity: 2,
          eta: "2026-09-01",
          status: "in_progress",
          responsiblePersonId: people.devin,
          accountablePersonId: people.marisol,
          informedPersonIds: [people.ken],
        },
        {
          phase: 5,
          category: "Brand Mktg Support",
          name: "Geo-target ads",
          spec: "5-mile radius around each of the 20 stores",
          quantity: 20,
          eta: "2026-09-18",
          status: "not_started",
          responsiblePersonId: people.priya,
          accountablePersonId: people.priya,
        },
        {
          phase: 5,
          category: "Brand Mktg Support",
          name: "Social media",
          spec: "3 posts + 1 reel on the Fetzer handle",
          quantity: 4,
          eta: "2026-09-18",
          status: "not_started",
          responsiblePersonId: people.tom,
          accountablePersonId: people.priya,
        },
        {
          phase: 5,
          category: "Distributor",
          name: "Sales rep training",
          spec: "Rep deck + 30-minute session for the Safeway team",
          quantity: 1,
          eta: "2026-08-18",
          // Overdue.
          status: "in_progress",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.ray,
          informedPersonIds: [people.alicia],
        },
        {
          phase: 6,
          category: "Retail Mktg Mechanics",
          name: "Photo audit setup",
          spec: "GPS-tagged photo audit template for 20 stores",
          eta: "2026-09-28",
          // Unassigned, and the only proof-of-execution mechanism.
          status: "not_started",
          accountablePersonId: people.alicia,
        },
      ],
    );

    // Live right now: execution phase, mostly healthy.
    const backToSchoolId = await ctx.db.insert("promotions", {
      chainPlanId: ralphsPlanId,
      chainId: chains.ralphs,
      seasonId,
      name: "Ralphs Back-to-School Rosé Endcap",
      brandIds: [brands.mendocino, brands.fetzer],
      startDate: "2026-08-03",
      endDate: "2026-09-07",
      storeCount: 30,
      currentPhase: 6,
      notes: "30-store endcap program, currently in market.",
    });

    taskCount += await insertChecklist(
      ctx,
      { promotionId: backToSchoolId },
      [
        {
          phase: 5,
          category: "Stores list",
          name: "Stores list",
          quantity: 30,
          eta: "2026-07-06",
          status: "delivered",
          deliveredTo: "Pacific Crest Distributing",
          responsiblePersonId: people.alicia,
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Displays",
          spec: "Endcap kit, 4-shelf",
          quantity: 30,
          eta: "2026-07-20",
          status: "delivered",
          deliveredTo: "Ralphs DC — Riverside",
          proofOfExecution: "Delivery receipt PC-88412",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Shelf talkers",
          spec: "24 in",
          quantity: 300,
          eta: "2026-07-24",
          status: "delivered",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 6,
          category: "Retail Mktg Mechanics",
          name: "Sell-in & CWD check",
          spec: "Target 90% CWD across 30 stores",
          eta: "2026-08-10",
          // Overdue.
          status: "in_progress",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.marisol,
          notes: "At 71% CWD; nine stores have not built the endcap yet.",
        },
        {
          phase: 6,
          category: "Retail Mktg Mechanics",
          name: "Store photo audit — week 2",
          spec: "GPS photo per store",
          quantity: 30,
          eta: "2026-08-24",
          status: "not_started",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 6,
          category: "Retail Mktg Mechanics",
          name: "Price compliance check",
          spec: "Verify $12.99 feature price is live",
          eta: "2026-08-17",
          // Overdue and unassigned.
          status: "not_started",
          accountablePersonId: people.marisol,
        },
      ],
    );

    // Finished in market, now being measured and reviewed.
    const summerRoseId = await ctx.db.insert("promotions", {
      chainPlanId: albertsonsPlanId,
      chainId: chains.albertsons,
      seasonId,
      name: "Albertsons Summer Rosé Feature",
      brandIds: [brands.mendocino, brands.bonterra],
      startDate: "2026-05-25",
      endDate: "2026-07-06",
      storeCount: 45,
      currentPhase: 7,
      notes:
        "Completed in market. Numbers are in and the retro is written up; the phase 7-8 tasks behind them were never closed out.",
    });

    // The one promotion far enough along to have a filled KPI grid and a retro.
    for (const entry of SUMMER_ROSE_KPIS) {
      await ctx.db.insert("kpiEntries", { promotionId: summerRoseId, ...entry });
    }
    await ctx.db.insert("retros", {
      promotionId: summerRoseId,
      ...SUMMER_ROSE_RETRO,
    });

    taskCount += await insertChecklist(
      ctx,
      { promotionId: summerRoseId },
      [
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Displays",
          spec: "Quarter-pallet, summer creative",
          quantity: 45,
          eta: "2026-05-08",
          status: "delivered",
          responsiblePersonId: people.jordan,
          accountablePersonId: people.alicia,
        },
        {
          phase: 6,
          category: "Retail Mktg Mechanics",
          name: "Execution audit",
          quantity: 45,
          eta: "2026-06-12",
          status: "delivered",
          proofOfExecution: "41 of 45 stores photographed",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.marisol,
        },
        {
          phase: 7,
          name: "Post-promo depletion pull",
          spec: "Baseline vs. promotional period vs. uplift",
          eta: "2026-07-31",
          // Overdue: the numbers the retro depends on.
          status: "in_progress",
          responsiblePersonId: people.wes,
          accountablePersonId: people.hana,
        },
        {
          phase: 7,
          name: "POS / scan data pull",
          spec: "Circana, 45 stores, 6-week window",
          eta: "2026-08-07",
          // Overdue.
          status: "in_progress",
          responsiblePersonId: people.wes,
          accountablePersonId: people.hana,
        },
        {
          phase: 7,
          name: "Spend ROI summary",
          spec: "$ investment vs. incremental cases",
          eta: "2026-08-21",
          status: "not_started",
          responsiblePersonId: people.hana,
          accountablePersonId: people.hana,
        },
        {
          phase: 8,
          name: "Post-promo retro",
          spec: "Worked / didn't / repeat next year",
          eta: "2026-09-04",
          // Unassigned: the learning loop back into next season's phase 0.
          status: "not_started",
          accountablePersonId: people.marisol,
          informedPersonIds: [people.priya, people.devin],
        },
      ],
    );

    // Approved but barely started: everything ahead of it, little of it owned.
    const thanksgivingId = await ctx.db.insert("promotions", {
      chainPlanId: safewayPlanId,
      chainId: chains.safeway,
      seasonId,
      name: "Safeway Thanksgiving Wine Rack Program",
      brandIds: [brands.fetzer, brands.thousandStories],
      startDate: "2026-11-09",
      endDate: "2026-11-29",
      storeCount: 60,
      currentPhase: 5,
      notes: "Approved at the June JBP; activation planning has not really begun.",
    });

    taskCount += await insertChecklist(
      ctx,
      { promotionId: thanksgivingId },
      [
        {
          phase: 5,
          category: "Stores list",
          name: "Stores list",
          quantity: 60,
          eta: "2026-09-11",
          status: "not_started",
          responsiblePersonId: people.alicia,
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Displays",
          spec: "Wine rack, 6-bottle capacity",
          quantity: 60,
          eta: "2026-09-25",
          // Unassigned.
          status: "not_started",
        },
        {
          phase: 5,
          category: "Retail Mktg Mechanics",
          name: "Shelf talkers",
          spec: "Spec TBC — chain has not confirmed size",
          quantity: 900,
          eta: "2026-10-02",
          // Unassigned.
          status: "not_started",
          accountablePersonId: people.alicia,
        },
        {
          phase: 5,
          category: "Brand Mktg Support",
          name: "Social media",
          spec: "Thanksgiving pairing content",
          eta: "2026-10-16",
          status: "not_started",
          responsiblePersonId: people.tom,
          accountablePersonId: people.priya,
        },
        {
          phase: 5,
          category: "Distributor",
          name: "Sales rep training",
          eta: "2026-10-23",
          status: "not_started",
          responsiblePersonId: people.bianca,
          accountablePersonId: people.ray,
        },
      ],
    );

    return {
      today: TODAY,
      deletedBeforeSeed: deleted,
      seasons: 1,
      chains: CHAINS.length,
      brands: BRANDS.length,
      functions: FUNCTIONS.length,
      people: PEOPLE.length,
      chainPlans: 4,
      promotions: 4,
      phaseRaciDefaults: matrixRows,
      tasks: taskCount,
      kpiEntries: SUMMER_ROSE_KPIS.length,
      retros: 1,
    };
  },
});
