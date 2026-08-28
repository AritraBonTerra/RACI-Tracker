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

// --- Access control (#30) -------------------------------------------------

// The two roles, and the only two there will be (#30: no read-only reviewer).
// An Administrator can reach and manage everything; a Member sees exactly the
// union of their Access Assignments and nothing else.
export const userRole = v.union(v.literal("administrator"), v.literal("member"));

// The tier an Access Assignment is pinned to. Access flows *down* from here:
// a Plan Year grant reaches its Chain Plans and their Promotions.
export const accessScope = v.union(
  v.object({ tier: v.literal("season"), seasonId: v.id("seasons") }),
  v.object({ tier: v.literal("chainPlan"), chainPlanId: v.id("chainPlans") }),
  v.object({ tier: v.literal("promotion"), promotionId: v.id("promotions") }),
);

// Every access-management action worth answering "who did that, and when?" for.
// Ordinary record edits are not audited — they carry a last-modified stamp
// instead (#30). The union is closed so a new action has to be named here.
export const auditAction = v.union(
  v.literal("user_created"),
  v.literal("role_changed"),
  v.literal("user_activated"),
  v.literal("user_deactivated"),
  v.literal("person_linked"),
  v.literal("access_granted"),
  v.literal("access_revoked"),
);

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
export const repeatVerdict = v.union(
  v.literal("yes"),
  v.literal("no"),
  v.literal("maybe"),
);

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

  // --- Access control (#30) ---------------------------------------------
  // Additive tables: nothing above them changes, so rolling this back is
  // redeploying the prior commit.

  // One row per signed-in identity (CONTEXT.md: User). Created by `ensureUser`
  // on first sign-in as an active Member with zero Access Assignments — active
  // because the account is real and `isActive: false` means "offboarded", and
  // zero-assignment because access is an Administrator's decision. Users are
  // never pre-provisioned: only the identity provider can mint a Clerk user id.
  //
  // `clerkUserId` is `identity.subject`: the primary key of the account as far
  // as this app is concerned. `entraOid` / `entraTid` are the durable Microsoft
  // identity, carried through Clerk's SAML attribute mapping; they are absent
  // in development (email-code sign-in has no Entra behind it) and on the very
  // first token if Clerk has not populated `publicMetadata` yet.
  //
  // Everything else is display material read off the token. `personId` is the
  // optional one-to-one link to an *internal* Person; RACI names People and
  // never grants access, so this link is orientation, not authorization.
  users: defineTable({
    clerkUserId: v.string(),
    role: userRole,
    isActive: v.boolean(),
    personId: v.optional(v.id("people")),

    email: v.optional(v.string()),
    displayName: v.optional(v.string()),

    entraOid: v.optional(v.string()),
    entraTid: v.optional(v.string()),
    entraUserType: v.optional(v.string()),

    lastSignInAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_role", ["role"])
    .index("by_person", ["personId"]),

  // One Member at one Plan Year, Chain Plan, or Promotion (CONTEXT.md: Access
  // Assignment). A Member's access is the *union* of their rows, expanded
  // downward at read time rather than stored, so a promotion created tomorrow
  // under a granted Chain Plan is reachable without touching this table.
  //
  // Exactly one of the three scope columns is set, flat rather than a union
  // object so "who can reach this promotion?" is an index read (same shape as
  // `tasks`). Overlapping rows are harmless by construction.
  accessAssignments: defineTable({
    userId: v.id("users"),
    seasonId: v.optional(v.id("seasons")),
    chainPlanId: v.optional(v.id("chainPlans")),
    promotionId: v.optional(v.id("promotions")),
    grantedBy: v.optional(v.id("users")),
  })
    .index("by_user", ["userId"])
    .index("by_season", ["seasonId"])
    .index("by_chain_plan", ["chainPlanId"])
    .index("by_promotion", ["promotionId"]),

  // The access history, kept indefinitely (CONTEXT.md: Audit event). Ordinary
  // record edits are not in here. The actor is a User, or the operator holding
  // deploy credentials — bootstrap and break-glass are actions too, and an
  // audit trail with a hole where the first Administrator came from is worse
  // than none. Ordered by `_creationTime`; no separate timestamp column.
  auditEvents: defineTable({
    action: auditAction,
    actor: v.union(
      v.object({ kind: v.literal("user"), userId: v.id("users") }),
      v.object({ kind: v.literal("operator") }),
    ),
    subjectUserId: v.id("users"),
    // One short phrase naming what changed ("member -> administrator").
    detail: v.optional(v.string()),
  }).index("by_subject", ["subjectUserId"]),

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
  // RACI: only the Responsible list decides assigned vs. unassigned — at least
  // one named person, or the task is the red state the tool exists to surface.
  // Accountable stays a single person on purpose: when a task is late, there is
  // exactly one name to chase (CONTEXT.md: RACI). The phase-default
  // matrix in `phaseRaciDefaults` says which *function* owns the work, and a
  // function is never a substitute for a named person.
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
    .index("by_season", ["seasonId"])
    .index("by_status", ["status"])
    .index("by_accountable", ["accountablePersonId"])
    .index("by_eta", ["eta"])
    .index("by_promotion_and_phase", ["promotionId", "phase"]),

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
  })
    .index("by_phase", ["phase"])
    .index("by_phase_and_function", ["phase", "functionId"])
    .index("by_function", ["functionId"]),

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
