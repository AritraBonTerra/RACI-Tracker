import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The nine phases of the Integrated Commercial Cycle (CONTEXT.md: Phase).
// 0 lives on a Season, 1-4 on a Chain Plan, 5-8 on a Promotion.
export const phase = v.union(
  v.literal(0),
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
  v.literal(8),
);

// Task lifecycle (CONTEXT.md: Status). "Overdue" is *not* here: it is derived
// from `eta` vs. today, never stored.
export const taskStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("delivered"),
);

// A single RACI letter. A cell of the phase-default matrix holds zero or more
// of these, so "A/R" (accountable and responsible) is ["accountable", "responsible"].
export const raciRole = v.union(
  v.literal("responsible"),
  v.literal("accountable"),
  v.literal("consulted"),
  v.literal("informed"),
);

// Functions split into the deck's internal/external stakeholder groups.
export const functionKind = v.union(v.literal("internal"), v.literal("external"));

// --- Phase 7-8 measurement (detachable feature, #14) ----------------------
// The two validators and the two tables at the bottom of the schema are the
// whole storage footprint of the KPI table and the retro. Removing the feature
// means deleting these four blocks plus `convex/kpi.ts`.

// The slide-14 rows of the phase-7 KPI table. A closed set: the grid is the
// deck's grid, and a promotion the sales team cannot compare to last year's is
// worth less than one with five agreed metrics.
export const kpiMetric = v.union(
  v.literal("depletions"),
  v.literal("pos"),
  v.literal("cwd"),
  v.literal("dollars_per_store_week"),
  v.literal("investment"),
);

// The phase-8 verdict. "Maybe" is a real answer — most retros land there.
export const repeatVerdict = v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"));

// Dates are ISO calendar days ("2026-10-31"), not timestamps: an ETA is a day a
// human agreed to, with no timezone attached. ISO strings also sort
// chronologically as plain strings (model.ts: checkedDay enforces the shape).
const isoDate = v.string();

export default defineSchema({
  // A planning year. Carries phase-0 work for the whole company.
  seasons: defineTable({
    year: v.number(),
    label: v.string(),
    notes: v.optional(v.string()),
  }).index("by_year", ["year"]),

  // A retail account (Safeway, Kroger, ...).
  chains: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
  }).index("by_name", ["name"]),

  // What is being promoted. Placeholder entries until real portfolio data lands.
  brands: defineTable({
    name: v.string(),
    isPlaceholder: v.boolean(),
    notes: v.optional(v.string()),
  }).index("by_name", ["name"]),

  // The six stakeholder buckets. `key` is the stable identifier used by code and
  // seed data; `name` is what the UI shows and is editable.
  functions: defineTable({
    key: v.string(),
    name: v.string(),
    kind: functionKind,
    order: v.number(),
  }),

  // A named human in a Function. Not a login account in v0.
  people: defineTable({
    name: v.string(),
    functionId: v.id("functions"),
    title: v.optional(v.string()),
    email: v.optional(v.string()),
    organization: v.optional(v.string()),
  }),

  // One Chain x one Season. Carries phases 1-4.
  chainPlans: defineTable({
    seasonId: v.id("seasons"),
    chainId: v.id("chains"),
    currentPhase: phase,
    jbpDate: v.optional(isoDate),
    notes: v.optional(v.string()),
  })
    .index("by_season", ["seasonId"])
    .index("by_chain", ["chainId"])
    .index("by_season_and_chain", ["seasonId", "chainId"]),

  // An approved program under a Chain Plan. Carries phases 5-8.
  // `chainId` and `seasonId` are copied from the plan at creation so a
  // promotion can name its chain and plan year without loading the plan first
  // (seasons.contextFor, model.ts: placeResolver). They never change: a
  // promotion does not move between plans.
  promotions: defineTable({
    chainPlanId: v.id("chainPlans"),
    chainId: v.id("chains"),
    seasonId: v.id("seasons"),
    name: v.string(),
    brandIds: v.array(v.id("brands")),
    startDate: isoDate,
    endDate: isoDate,
    storeCount: v.optional(v.number()),
    currentPhase: phase,
    notes: v.optional(v.string()),
  }).index("by_chain_plan", ["chainPlanId"]),

  // A unit of work on a phase checklist.
  //
  // Ownership: exactly one of `seasonId` / `chainPlanId` / `promotionId` is set,
  // matching where the task's phase lives (0 -> season, 1-4 -> chain plan,
  // 5-8 -> promotion). Three nullable columns rather than a union because index
  // lookups ("tasks of this promotion") need a flat field to point at.
  //
  // RACI: only the Responsible list decides assigned vs. unassigned — at least
  // one named person, or the task is the red state the tool exists to surface.
  // Accountable stays a single person on purpose: when a task is late, there is
  // exactly one name to chase (CONTEXT.md: RACI). The phase-default
  // matrix in `phaseRaciDefaults` says which *function* owns the work, and a
  // function is never a substitute for a named person.
  //
  // `blockedReason` is required whenever status is "blocked". A validator cannot
  // make one field depend on another, so mutations enforce it (model.ts:
  // assertBlockedReason).
  tasks: defineTable({
    seasonId: v.optional(v.id("seasons")),
    chainPlanId: v.optional(v.id("chainPlans")),
    promotionId: v.optional(v.id("promotions")),

    phase,
    name: v.string(),
    // Free text on purpose: specs vary per chain ("32 in", "6ft endcap").
    spec: v.optional(v.string()),
    // Slide-11 grouping ("Retail Mktg Mechanics", "Brand Mktg Support", ...).
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    eta: v.optional(isoDate),

    status: taskStatus,
    blockedReason: v.optional(v.string()),
    deliveredTo: v.optional(v.string()),
    proofOfExecution: v.optional(v.string()),

    // Legacy single-Responsible column, kept only so documents written before
    // the list existed still validate. Never read directly — `responsiblesOf`
    // (model.ts) folds it into the list, and every write clears it.
    responsiblePersonId: v.optional(v.id("people")),
    // Optional rather than required for the same migration reason; undefined
    // means "not yet rewritten", not "unassigned".
    responsiblePersonIds: v.optional(v.array(v.id("people"))),
    accountablePersonId: v.optional(v.id("people")),
    consultedPersonIds: v.array(v.id("people")),
    informedPersonIds: v.array(v.id("people")),

    order: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_promotion", ["promotionId"])
    .index("by_chain_plan", ["chainPlanId"])
    .index("by_season", ["seasonId"]),

  // The Task Template (CONTEXT.md): one global default checklist per phase,
  // stamped onto a new plan year / chain plan / promotion at creation. A
  // stencil, not a live link — editing a template never touches existing
  // checklists. No ETAs on purpose: dates are negotiated per chain, and a
  // fresh plan screaming "overdue" over fictional deadlines would cheapen the
  // red states the tool runs on.
  taskTemplates: defineTable({
    phase,
    name: v.string(),
    spec: v.optional(v.string()),
    category: v.optional(v.string()),
    quantity: v.optional(v.number()),
    order: v.number(),
  }).index("by_phase", ["phase"]),

  // The slide-16 matrix: for each phase, which role(s) each function plays by
  // default. Seeded from the deck and editable in-app later, which is why it is
  // data rather than a constant. `note` carries cells the four letters cannot
  // express — the buyer's phase-3 cell reads "Decision".
  phaseRaciDefaults: defineTable({
    phase,
    functionId: v.id("functions"),
    roles: v.array(raciRole),
    note: v.optional(v.string()),
  }).index("by_phase", ["phase"]),

  // --- Phase 7-8 measurement (detachable feature, #14) --------------------

  // One row of the phase-7 KPI grid: a metric measured across the baseline and
  // the promotional period. Every number is typed by a human — there are no
  // data integrations, so a value is present only because someone entered it,
  // and an absent value is left absent rather than defaulted to zero.
  //
  // Uplift is derived from the two columns, never stored. `upliftOverride` is
  // the escape hatch for the row where subtraction says nothing useful ("$1.62
  // margin per $1 spent" against an investment line), and it is free text
  // because the thing it replaces is a sentence, not a number.
  kpiEntries: defineTable({
    promotionId: v.id("promotions"),
    metric: kpiMetric,
    baseline: v.optional(v.number()),
    promotional: v.optional(v.number()),
    upliftOverride: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_promotion", ["promotionId"])
    .index("by_promotion_and_metric", ["promotionId", "metric"]),

  // The phase-8 review: at most one per promotion. Every field is optional
  // because a retro gets written in the order the room talks, not top to bottom.
  retros: defineTable({
    promotionId: v.id("promotions"),
    worked: v.optional(v.string()),
    didntWork: v.optional(v.string()),
    repeatNextYear: v.optional(repeatVerdict),
    notes: v.optional(v.string()),
  }).index("by_promotion", ["promotionId"]),
});
