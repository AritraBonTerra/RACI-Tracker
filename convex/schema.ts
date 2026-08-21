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

// Dates are ISO calendar days ("2026-10-31"), not timestamps: an ETA is a day a
// human agreed to, with no timezone attached. ISO strings also sort
// chronologically, so range indexes on them work.
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
  }).index("by_key", ["key"]),

  // A named human in a Function. Not a login account in v0.
  people: defineTable({
    name: v.string(),
    functionId: v.id("functions"),
    title: v.optional(v.string()),
    email: v.optional(v.string()),
    organization: v.optional(v.string()),
  })
    .index("by_function", ["functionId"])
    .index("by_name", ["name"]),

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
  // `chainId` and `seasonId` are denormalized from the plan so the headline
  // question — "every Safeway promotion and who is acting on it" — is one index
  // read rather than a join.
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
  })
    .index("by_chain_plan", ["chainPlanId"])
    .index("by_chain", ["chainId"])
    .index("by_season", ["seasonId"])
    .index("by_start_date", ["startDate"]),

  // A unit of work on a phase checklist.
  //
  // Ownership: exactly one of `seasonId` / `chainPlanId` / `promotionId` is set,
  // matching where the task's phase lives (0 -> season, 1-4 -> chain plan,
  // 5-8 -> promotion). Three nullable columns rather than a union because index
  // lookups ("tasks of this promotion") need a flat field to point at.
  //
  // RACI: only `responsiblePersonId` decides assigned vs. unassigned. The
  // phase-default matrix in `phaseRaciDefaults` says which *function* owns the
  // work, and a function is never a substitute for a named person.
  //
  // `blockedReason` is required whenever status is "blocked"; the schema cannot
  // express that without giving up the `by_status` index, so mutations enforce it.
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

    responsiblePersonId: v.optional(v.id("people")),
    accountablePersonId: v.optional(v.id("people")),
    consultedPersonIds: v.array(v.id("people")),
    informedPersonIds: v.array(v.id("people")),

    order: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_promotion", ["promotionId"])
    .index("by_chain_plan", ["chainPlanId"])
    .index("by_season", ["seasonId"])
    .index("by_status", ["status"])
    .index("by_responsible", ["responsiblePersonId"])
    .index("by_accountable", ["accountablePersonId"])
    .index("by_eta", ["eta"])
    .index("by_promotion_and_phase", ["promotionId", "phase"]),

  // The slide-16 matrix: for each phase, which role(s) each function plays by
  // default. Seeded from the deck and editable in-app later, which is why it is
  // data rather than a constant. `note` carries cells the four letters cannot
  // express — the buyer's phase-3 cell reads "Decision".
  phaseRaciDefaults: defineTable({
    phase,
    functionId: v.id("functions"),
    roles: v.array(raciRole),
    note: v.optional(v.string()),
  })
    .index("by_phase", ["phase"])
    .index("by_phase_and_function", ["phase", "functionId"])
    .index("by_function", ["functionId"]),
});
