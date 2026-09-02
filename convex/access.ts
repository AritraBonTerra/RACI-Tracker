import type { UserIdentity } from "convex/server";
import { ConvexError, type Infer } from "convex/values";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import {
  fromUrl,
  type LastModified,
  memo,
  missing,
  mustGet,
  ownerOfTask,
  type TaskOwner,
} from "./model";
import type { accessScope } from "./schema";

// The access module (#30). Everything about "who is calling, and may they?"
// lives here, and nothing outside this file may build a bare `query` or
// `mutation` — `accessBoundary.test.ts` enforces that by grep, because a single
// unwrapped function is a hole in the whole boundary.
//
// The shape of the boundary:
//
//   authedQuery / authedMutation   a signed-in, active User; injects `viewer`
//                                  (and, for mutations, the `stamp` every
//                                  ordinary record edit carries)
//   adminQuery / adminMutation     the same, and `viewer.role` is administrator
//   me                             the one query that answers for callers who
//                                  are *not* signed in, so the UI can render
//                                  the sign-in, no-access and deactivated
//                                  screens. Shaping only — never a gate.
//   ensureUser                     first-sign-in entry point: any admissible
//                                  identity may create its own zero-access User
//
// Ahead of all of them sits the optional admission gate below
// (`ALLOWED_EMAIL_DOMAIN`), which decides who may hold an account at all.
//
// The client UI is never the security boundary: every wrapper resolves identity
// server-side, and every failure is the same opaque refusal.

export type AccessScope = Infer<typeof accessScope>;

/** The signed-in, active User behind a call. Injected by the wrappers. */
export type Viewer = Doc<"users">;

/**
 * One message for every refusal — not signed in, token for an unknown account,
 * deactivated account, and Member-calling-an-Administrator-function all read
 * identically, so a rejected call never reports which door was locked.
 */
const DENIED = "You don't have access to this.";

function deny(): never {
  throw new ConvexError(DENIED);
}

// --- The admission gate ---------------------------------------------------
// The optional first filter, ahead of everything below (#30, story 6, as
// revised in `docs/adr/0003-…`). Sign-in itself no longer refuses anybody: the
// identity provider admits any Google account and any address that can receive
// a code, so "is this an employee at all?" is asked here instead.
//
// Set `ALLOWED_EMAIL_DOMAIN` on the Convex deployment and only verified
// addresses at that domain may become or remain a User. Leave it unset and the
// gate is off — any verified sign-in becomes a zero-access Member and waits for
// an Administrator, which is the real boundary either way.
//
// Email is an *admission* filter and nothing more. The identity key stays the
// Clerk user id (`users.by_clerk_user_id`), every authorization decision below
// reads the User row and its Access Assignments, and no scope check anywhere
// looks at an address. Changing this variable can only ever narrow who may hold
// an account; it can never widen what one reaches.

/**
 * The configured domain, normalised. A value pasted as `@vctusa.com`,
 * `VCTUSA.com` or with a stray space means the same thing as `vctusa.com`,
 * because the person setting it is copying from a dashboard.
 */
function allowedEmailDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, "");
}

/**
 * Whether an address is inside the configured domain. It has to end with
 * `@<domain>` rather than merely contain it, so `vctusa.com.attacker.net` and
 * `notvctusa.com` are both outside. With the gate off, every address is inside.
 */
function admissibleAddress(email: string | undefined): boolean {
  const domain = allowedEmailDomain();
  if (domain === "") return true;
  return (email ?? "").trim().toLowerCase().endsWith(`@${domain}`);
}

/**
 * Whether this identity may hold an account on this deployment.
 *
 * Two conditions when the gate is on, and both matter. The address has to be
 * **verified** — an unverified one is a claim the identity provider has not
 * checked, and treating it as a domain membership would make the gate a
 * text field. And it has to be inside the domain (`admissibleAddress`).
 */
function admissible(identity: UserIdentity): boolean {
  if (allowedEmailDomain() === "") return true;
  if (identity.emailVerified !== true) return false;
  return admissibleAddress(identity.email);
}

/**
 * Whether a User can still get in: active, and — when the gate is on — at a
 * verified address the gate admits, as of the last token this row saw. The
 * guard below counts these, not rows: an Administrator created before the gate
 * was turned on, at an outside address, is one the gate now refuses at the
 * door, and a way back in that nobody can take is not a way back in. A row
 * written before verification was recorded reads as unverified until its next
 * sign-in, which errs toward refusing to remove an Administrator rather than
 * toward counting one who cannot get in.
 */
export function canSignIn(user: Doc<"users">): boolean {
  if (!user.isActive) return false;
  if (allowedEmailDomain() === "") return true;
  return user.emailVerified === true && admissibleAddress(user.email);
}

/**
 * The identity check, in one place. Returns null for every reason a caller
 * might not be a usable viewer, deliberately without distinguishing them:
 * no token, an unverifiable token (Convex has already dropped those), an
 * identity the domain gate does not admit, a token for an identity with no User
 * row yet, or a deactivated User.
 *
 * The gate is re-read on every call rather than only at admission, so turning
 * it on locks out an account admitted while it was off — without that, the
 * variable would only ever govern the future.
 */
async function viewerOrNull(ctx: QueryCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  if (!admissible(identity)) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (user === null || !user.isActive) return null;
  return user;
}

async function requireViewer(ctx: QueryCtx): Promise<Viewer> {
  const viewer = await viewerOrNull(ctx);
  if (viewer === null) deny();
  return viewer;
}

async function requireAdministrator(ctx: QueryCtx): Promise<Viewer> {
  const viewer = await requireViewer(ctx);
  if (viewer.role !== "administrator") deny();
  return viewer;
}

// --- Expanded access ------------------------------------------------------

/**
 * How far a viewer sees one record of the hierarchy.
 *
 *   full     the record and everything in it: checklists, rollups, phases
 *   context  it exists somewhere above something granted, so its *name* is
 *            orientation and nothing else — never a link, never its content
 *   none     absent, indistinguishable from deleted
 */
export type Reach = "full" | "context" | "none";

/** The stored ancestry columns a scope check reads off a loaded Chain Plan. */
type PlanAncestry = { _id: Id<"chainPlans">; seasonId: Id<"seasons"> };

/** The same for a Promotion — `chainPlanId` and `seasonId` are denormalized. */
type PromotionAncestry = {
  _id: Id<"promotions">;
  chainPlanId: Id<"chainPlans">;
  seasonId: Id<"seasons">;
};

/**
 * One viewer's Access Assignments, expanded for the duration of a single call
 * (CONTEXT.md: Access Assignment). Access is the union of the assignments and
 * flows *down* — a Plan Year grant reaches Chain Plans and Promotions created
 * long after the grant, because nothing here is snapshotted.
 *
 * Every question takes the *loaded* record and reads its own ancestry columns.
 * A client-supplied id is therefore only ever a lookup key: it names a row, and
 * the row decides. There is no shape of argument that can talk its way in.
 */
export type Scope = Readonly<{
  isAdministrator: boolean;
  season: (seasonId: Id<"seasons">) => Reach;
  chainPlan: (plan: PlanAncestry) => Reach;
  promotion: (promotion: PromotionAncestry) => Reach;
}>;

/** An Administrator reaches everything, so nothing has to be loaded to say so. */
const EVERYTHING: Scope = {
  isAdministrator: true,
  season: () => "full",
  chainPlan: () => "full",
  promotion: () => "full",
};

/**
 * Turn a set of Access Assignment roots into the three answers above.
 *
 * Exported because the Directory's effective-access preview asks exactly this
 * question about somebody else, and about a grant that has not been made yet
 * (#34): "what would they see?" has to be answered by the code that decides
 * what they see, or the preview is a second opinion.
 *
 * An assignment whose target has since been deleted expands to nothing rather
 * than to everything: the grant is a pointer, and a dangling pointer is not a
 * key to the tier it used to name.
 */
export async function expandScopes(ctx: QueryCtx, scopes: readonly AccessScope[]): Promise<Scope> {
  const grantedSeasons = new Set<Id<"seasons">>();
  const grantedPlans = new Set<Id<"chainPlans">>();
  const grantedPromotions = new Set<Id<"promotions">>();
  // Ancestors of something granted: names, not doors.
  const contextSeasons = new Set<Id<"seasons">>();
  const contextPlans = new Set<Id<"chainPlans">>();

  for (const scope of scopes) {
    if (scope.tier === "season") {
      const season = await ctx.db.get(scope.seasonId);
      if (season !== null) grantedSeasons.add(season._id);
    } else if (scope.tier === "chainPlan") {
      const plan = await ctx.db.get(scope.chainPlanId);
      if (plan !== null) {
        grantedPlans.add(plan._id);
        contextSeasons.add(plan.seasonId);
      }
    } else {
      const promotion = await ctx.db.get(scope.promotionId);
      if (promotion !== null) {
        grantedPromotions.add(promotion._id);
        contextPlans.add(promotion.chainPlanId);
        contextSeasons.add(promotion.seasonId);
      }
    }
  }

  return {
    isAdministrator: false,
    season: (seasonId) =>
      grantedSeasons.has(seasonId) ? "full" : contextSeasons.has(seasonId) ? "context" : "none",
    chainPlan: (plan) =>
      grantedSeasons.has(plan.seasonId) || grantedPlans.has(plan._id)
        ? "full"
        : contextPlans.has(plan._id)
          ? "context"
          : "none",
    // Nothing hangs below a Promotion, so it is never mere context.
    promotion: (promotion) =>
      grantedSeasons.has(promotion.seasonId) ||
      grantedPlans.has(promotion.chainPlanId) ||
      grantedPromotions.has(promotion._id)
        ? "full"
        : "none",
  };
}

/**
 * The viewer's own reach: their assignment rows, expanded. Straight off the
 * rows rather than through `scopesOf`, because `expandScopes` loads each target
 * anyway and drops the ones that are gone — checking twice would double the
 * reads on the path every authenticated call takes.
 */
async function scopeOf(ctx: QueryCtx, viewer: Viewer): Promise<Scope> {
  if (viewer.role === "administrator") return EVERYTHING;
  return await expandScopes(ctx, await assignmentScopes(ctx, viewer._id));
}

// --- The wrappers ---------------------------------------------------------
// Written against `QueryCtx` and reused for mutations: resolving a viewer and
// expanding their access only ever reads, so the mutation wrappers keep their
// write access untouched.
//
// `scope` is resolved eagerly rather than on demand. It costs an Administrator
// nothing and a Member one index read plus one get per assignment, against
// handlers that already scan whole checklists — and a scope that is always
// there is a scope no handler can forget to ask for.

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx: QueryCtx) => {
    const viewer = await requireViewer(ctx);
    return { viewer, scope: await scopeOf(ctx, viewer) };
  }),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => {
    const viewer = await requireViewer(ctx);
    return { viewer, scope: await scopeOf(ctx, viewer), stamp: stampFor(viewer) };
  }),
);

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx: QueryCtx) => ({
    viewer: await requireAdministrator(ctx),
    scope: EVERYTHING,
  })),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => {
    const viewer = await requireAdministrator(ctx);
    return { viewer, scope: EVERYTHING, stamp: stampFor(viewer) };
  }),
);

/**
 * The last-modified stamp for everything one mutation writes (#30, story 28).
 *
 * Built by the wrapper rather than by each handler, so a handler cannot stamp
 * somebody else's id and cannot write half of the pair. One timestamp per
 * mutation is the honest reading anyway: a transaction is one edit, however
 * many rows it touches.
 */
function stampFor(viewer: Viewer): LastModified {
  return { lastModifiedBy: viewer._id, lastModifiedAt: Date.now() };
}

// --- The read gates -------------------------------------------------------
// Every id that arrives off the URL bar enters the backend through one of
// these. They resolve the id and then refuse it, and the refusal is the same
// `null` a deleted record gives — so a denied deep link cannot be told apart
// from a dead one by a caller counting bytes (#27, scenario 14).

/**
 * A Plan Year the viewer can at least name, with how far they see it. The one
 * gate that admits `context`, because the navigation tree draws the year above
 * a granted Chain Plan as a label.
 */
export async function visibleSeason(
  ctx: QueryCtx,
  scope: Scope,
  seasonId: string,
): Promise<{ season: Doc<"seasons">; reach: "full" | "context" } | null> {
  const season = await fromUrl(ctx, "seasons", seasonId);
  if (season === null) return null;
  const reach = scope.season(season._id);
  return reach === "none" ? null : { season, reach };
}

/** A Plan Year whose own content — phase 0 — the viewer may read. */
export async function readableSeason(
  ctx: QueryCtx,
  scope: Scope,
  seasonId: string,
): Promise<Doc<"seasons"> | null> {
  const visible = await visibleSeason(ctx, scope, seasonId);
  return visible?.reach === "full" ? visible.season : null;
}

/** A Chain Plan whose phases 1-4 the viewer may read. */
export async function readableChainPlan(
  ctx: QueryCtx,
  scope: Scope,
  chainPlanId: string,
): Promise<Doc<"chainPlans"> | null> {
  const plan = await fromUrl(ctx, "chainPlans", chainPlanId);
  if (plan === null) return null;
  return scope.chainPlan(plan) === "full" ? plan : null;
}

/** A Promotion whose phases 5-8, KPI entries and Retro the viewer may read. */
export async function readablePromotion(
  ctx: QueryCtx,
  scope: Scope,
  promotionId: string,
): Promise<Doc<"promotions"> | null> {
  const promotion = await fromUrl(ctx, "promotions", promotionId);
  if (promotion === null) return null;
  return scope.promotion(promotion) === "full" ? promotion : null;
}

/**
 * The in-scope subset of a pile of tasks drawn from every tier at once — a
 * person's workload, the needs-attention rail. A task carries no ancestry of
 * its own, so its owner decides; owners are cached, so a promotion's twelve
 * rows cost one read rather than twelve.
 *
 * Lists built top-down from the viewer's assignment roots never need this. It
 * is for the two places that legitimately start from a table scan.
 */
export async function visibleTasks(
  ctx: QueryCtx,
  scope: Scope,
  tasks: readonly Doc<"tasks">[],
): Promise<Doc<"tasks">[]> {
  if (scope.isAdministrator) return [...tasks];

  const planOf = memo<"chainPlans">(ctx);
  const promotionOf = memo<"promotions">(ctx);

  const mayRead = async (task: Doc<"tasks">): Promise<boolean> => {
    if (task.promotionId !== undefined) {
      const promotion = await promotionOf(task.promotionId);
      return promotion !== null && scope.promotion(promotion) === "full";
    }
    if (task.chainPlanId !== undefined) {
      const plan = await planOf(task.chainPlanId);
      return plan !== null && scope.chainPlan(plan) === "full";
    }
    if (task.seasonId !== undefined) return scope.season(task.seasonId) === "full";
    // A task attached to nothing belongs to nobody's scope.
    return false;
  };

  const keep = await Promise.all(tasks.map(mayRead));
  return tasks.filter((_, index) => keep[index]);
}

// --- The write gates ------------------------------------------------------
// The read gates answer with `null`, because a read that finds nothing is a
// page that says "this doesn't exist, or you don't have access". A write has
// nothing to render, so these throw instead — and they throw `missing()`, the
// exact error a genuinely deleted record raises (model.ts). A mutation aimed at
// an out-of-scope id, a forged id, or a deleted one produces one indistinguish-
// able failure, so no sequence of writes can map what exists (#27, scenario 15).
//
// Every gate reads the ancestry off the *loaded* record. The id in the argument
// is a lookup key and never an authorization input: there is no shape of
// argument that can claim a parent it does not have.

/** The label each tier goes by in the one error every refusal shares. */
const TIER_LABEL = {
  season: "season",
  chainPlan: "chain plan",
  promotion: "promotion",
} as const satisfies Record<TaskOwner["tier"], string>;

/** A Plan Year whose own fields and phase-0 checklist the viewer may write. */
export async function writableSeason(
  ctx: QueryCtx,
  scope: Scope,
  seasonId: Id<"seasons">,
): Promise<Doc<"seasons">> {
  const season = await mustGet(ctx, seasonId, TIER_LABEL.season);
  // "context" is a name for orientation, never a handle: a Member who can read
  // the year label above their Chain Plan cannot rename the year.
  if (scope.season(season._id) !== "full") missing(TIER_LABEL.season);
  return season;
}

/** A Chain Plan whose own fields and phase 1-4 checklist the viewer may write. */
export async function writableChainPlan(
  ctx: QueryCtx,
  scope: Scope,
  chainPlanId: Id<"chainPlans">,
): Promise<Doc<"chainPlans">> {
  const plan = await mustGet(ctx, chainPlanId, TIER_LABEL.chainPlan);
  if (scope.chainPlan(plan) !== "full") missing(TIER_LABEL.chainPlan);
  return plan;
}

/**
 * A Promotion whose own fields, phase 5-8 checklist, KPI entries and Retro the
 * viewer may write — phase 7-8 work happens where the promotion lives (#22).
 */
export async function writablePromotion(
  ctx: QueryCtx,
  scope: Scope,
  promotionId: Id<"promotions">,
): Promise<Doc<"promotions">> {
  const promotion = await mustGet(ctx, promotionId, TIER_LABEL.promotion);
  if (scope.promotion(promotion) !== "full") missing(TIER_LABEL.promotion);
  return promotion;
}

/** How far a viewer reaches the tier record a checklist hangs on. */
async function reachOfOwner(ctx: QueryCtx, scope: Scope, owner: TaskOwner): Promise<Reach> {
  if (owner.tier === "season") {
    const season = await ctx.db.get(owner.seasonId);
    return season === null ? "none" : scope.season(season._id);
  }
  if (owner.tier === "chainPlan") {
    const plan = await ctx.db.get(owner.chainPlanId);
    return plan === null ? "none" : scope.chainPlan(plan);
  }
  const promotion = await ctx.db.get(owner.promotionId);
  return promotion === null ? "none" : scope.promotion(promotion);
}

/**
 * The tier record a new task is being hung on. This is the create half of the
 * matrix: the client names a parent, the parent is loaded, and *its* ancestry
 * decides — so a create aimed at an out-of-scope Chain Plan is refused however
 * the argument is dressed up, and refused the way a deleted parent is.
 */
export async function writableOwner(ctx: QueryCtx, scope: Scope, owner: TaskOwner): Promise<void> {
  if ((await reachOfOwner(ctx, scope, owner)) !== "full") missing(TIER_LABEL[owner.tier]);
}

/**
 * A task the viewer may edit, delete or reorder, with the owner its siblings
 * hang off. A task carries no ancestry of its own, so its owner is loaded and
 * asked.
 */
export async function writableTask(
  ctx: QueryCtx,
  scope: Scope,
  taskId: Id<"tasks">,
): Promise<{ task: Doc<"tasks">; owner: TaskOwner }> {
  const task = await mustGet(ctx, taskId, "task");
  const owner = ownerOfTask(task);
  // Every way the answer can be no — owner deleted, owner out of scope, task
  // attached to nothing — collapses into the refusal a deleted *task* gives.
  // Raising the owner's tier here would report what kind of record the caller
  // had just failed to reach, which is half of what they were probing for.
  if (owner === null || (await reachOfOwner(ctx, scope, owner)) !== "full") {
    missing("task");
  }
  return { task, owner };
}

/**
 * Names for the last-modified stamps in one payload: `lastModifiedBy` is a User
 * id, and "edited by usr_2f8…" answers nobody's question.
 *
 * Returned as a lookup beside the records rather than folded into each one, so
 * a checklist of twenty rows edited by the same two people carries two names.
 * Only the display name crosses the wire — a Member reading who last touched
 * their promotion learns a name, never a role, a scope, or a work address
 * (#22, story 17). A User whose token carried no name claim is "Someone"
 * rather than their email.
 *
 * A stamp naming a User who has since been deleted resolves to nothing, and the
 * client renders the record unstamped: a dangling id is not a person.
 */
export async function editorsOf(
  ctx: QueryCtx,
  records: ReadonlyArray<{ lastModifiedBy?: Id<"users"> }>,
): Promise<Record<string, string>> {
  const ids = [...new Set(records.flatMap((record) => record.lastModifiedBy ?? []))];
  const users = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return Object.fromEntries(
    users.flatMap((user) =>
      user === null ? [] : [[user._id, user.displayName ?? "Someone"] as const],
    ),
  );
}

// --- Reading and writing Users --------------------------------------------

/**
 * The tier one Access Assignment row names, in the public scope shape. Null for
 * a row with no scope column at all, which grants nothing rather than
 * everything.
 */
export function scopeOfAssignment(assignment: Doc<"accessAssignments">): AccessScope | null {
  if (assignment.seasonId !== undefined) {
    return { tier: "season", seasonId: assignment.seasonId };
  }
  if (assignment.chainPlanId !== undefined) {
    return { tier: "chainPlan", chainPlanId: assignment.chainPlanId };
  }
  if (assignment.promotionId !== undefined) {
    return { tier: "promotion", promotionId: assignment.promotionId };
  }
  return null;
}

/** Every scope a User's assignment rows name, without asking whether they exist. */
async function assignmentScopes(ctx: QueryCtx, userId: Id<"users">): Promise<AccessScope[]> {
  const assignments = await ctx.db
    .query("accessAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return assignments.flatMap((assignment) => scopeOfAssignment(assignment) ?? []);
}

/** The record a scope points at, or null if it is gone. */
async function targetOf(ctx: QueryCtx, scope: AccessScope) {
  if (scope.tier === "season") return await ctx.db.get(scope.seasonId);
  if (scope.tier === "chainPlan") return await ctx.db.get(scope.chainPlanId);
  return await ctx.db.get(scope.promotionId);
}

/**
 * The Access Assignment roots of one User, in the public scope shape.
 *
 * Assignments pointing at a record that no longer exists are left out, so this
 * is what the User can actually reach rather than what was once written down —
 * "has any access at all" is the question the shell asks it, and a grant to a
 * deleted Promotion is not access.
 */
export async function scopesOf(ctx: QueryCtx, userId: Id<"users">): Promise<AccessScope[]> {
  const scopes = await assignmentScopes(ctx, userId);
  const live = await Promise.all(
    scopes.map(async (scope) => (await targetOf(ctx, scope)) !== null),
  );
  return scopes.filter((_, index) => live[index]);
}

/** Where the shell opens for a User (#24). */
type Landing = { kind: "dashboard" } | { kind: "promotion"; promotionId: Id<"promotions"> };

/**
 * A Member whose whole world is one Promotion skips the dashboard and lands on
 * it — for them the dashboard would be a page-long restatement of one card.
 * Two grants, a Chain Plan, a Plan Year, or the Administrator role all mean
 * there is something to survey, so the dashboard is the door.
 */
function landingFor(role: Viewer["role"], scopes: readonly AccessScope[]): Landing {
  const [only, ...rest] = scopes;
  if (role === "member" && rest.length === 0 && only?.tier === "promotion") {
    return { kind: "promotion", promotionId: only.promotionId };
  }
  return { kind: "dashboard" };
}

/** Writes one row of the access history (CONTEXT.md: Audit event). */
async function recordAuditEvent(
  ctx: MutationCtx,
  event: Omit<Doc<"auditEvents">, "_id" | "_creationTime">,
) {
  await ctx.db.insert("auditEvents", event);
}

// --- Administering access -------------------------------------------------
// The five things an Administrator does to an account — role, activation,
// Person link, grant, revoke — and the guard that stops the last one of them
// locking everybody out.
//
// They live here rather than in the Directory module because the
// deploy-credential CLI (bootstrap.ts) performs the same actions from the other
// side of the deployment. One implementation means the surface an Administrator
// clicks and the one an operator types cannot drift into different semantics,
// and every one of them writes its Audit event on the way past — a caller
// cannot perform half the action.

/** Who did it: a signed-in Administrator, or whoever holds deploy credentials. */
export type Actor = Doc<"auditEvents">["actor"];

/** Names the operator in an audit detail, since they have no account to name. */
function via(actor: Actor): string {
  return actor.kind === "operator" ? " (deploy credentials)" : "";
}

/** The three columns an assignment can be pinned to, from one scope argument. */
function scopeColumns(scope: AccessScope) {
  return {
    seasonId: scope.tier === "season" ? scope.seasonId : undefined,
    chainPlanId: scope.tier === "chainPlan" ? scope.chainPlanId : undefined,
    promotionId: scope.tier === "promotion" ? scope.promotionId : undefined,
  };
}

/** The assignment for exactly this User at exactly this tier, if it exists. */
async function assignmentFor(ctx: QueryCtx, userId: Id<"users">, scope: AccessScope) {
  const columns = scopeColumns(scope);
  const rows = await ctx.db
    .query("accessAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return (
    rows.find(
      (row) =>
        row.seasonId === columns.seasonId &&
        row.chainPlanId === columns.chainPlanId &&
        row.promotionId === columns.promotionId,
    ) ?? null
  );
}

/**
 * Refuses a grant naming a record that is not there. Raised as `missing()` —
 * the same refusal a deleted record gives everywhere else — so a grant aimed at
 * a forged promotion id cannot be told apart from one aimed at a deleted
 * promotion, and the Directory is not a place to enumerate ids from.
 */
async function assertScopeExists(ctx: QueryCtx, scope: AccessScope) {
  if ((await targetOf(ctx, scope)) === null) missing(TIER_LABEL[scope.tier]);
}

/**
 * Give a User access to one Plan Year, Chain Plan or Promotion. Access is the
 * union of a User's assignments, so granting a second overlapping scope is
 * harmless and re-granting the same one is a no-op — which is what makes
 * revoking a redundant grant safe (#30, story 23).
 *
 * Grants go to Members. An Administrator already reaches everything, so an
 * assignment on one is dead weight and is refused rather than silently stored.
 *
 * Returns whether anything changed, so a caller can say "already had it".
 */
export async function grantScope(
  ctx: MutationCtx,
  user: Doc<"users">,
  scope: AccessScope,
  actor: Actor,
): Promise<boolean> {
  if (user.role === "administrator") {
    throw new ConvexError("Administrators already reach everything — no assignment needed.");
  }
  await assertScopeExists(ctx, scope);
  if ((await assignmentFor(ctx, user._id, scope)) !== null) return false;

  await ctx.db.insert("accessAssignments", {
    userId: user._id,
    ...scopeColumns(scope),
    grantedBy: actor.kind === "user" ? actor.userId : undefined,
  });
  await recordAuditEvent(ctx, {
    action: "access_granted",
    actor,
    subjectUserId: user._id,
    detail: `${await auditLabel(ctx, scope)}${via(actor)}`,
  });
  return true;
}

/**
 * Take one assignment back. Only that row goes: a Member holding a redundant
 * second grant keeps everything the union still covers (#27, scenario 11).
 *
 * A scope that was never granted is not an error — the row is gone either way,
 * and two Administrators revoking the same grant is a race, not a mistake.
 */
export async function revokeScope(
  ctx: MutationCtx,
  user: Doc<"users">,
  scope: AccessScope,
  actor: Actor,
): Promise<boolean> {
  const existing = await assignmentFor(ctx, user._id, scope);
  if (existing === null) return false;

  await ctx.db.delete(existing._id);
  await recordAuditEvent(ctx, {
    action: "access_revoked",
    actor,
    subjectUserId: user._id,
    detail: `${await auditLabel(ctx, scope)}${via(actor)}`,
  });
  return true;
}

/**
 * The name one scope goes by in the grants list, the audit feed and a Member's
 * own "what do I have?" — always naming the tiers above it, because "Holiday
 * Endcap" without its chain is two promotions in a busy year, and with its
 * chain but without its year is the same promotion two years running. Null
 * when the record is gone.
 */
export async function labelOf(ctx: QueryCtx, scope: AccessScope): Promise<string | null> {
  if (scope.tier === "season") {
    const season = await ctx.db.get(scope.seasonId);
    return season === null ? null : `Plan Year ${season.label}`;
  }
  if (scope.tier === "chainPlan") {
    const plan = await ctx.db.get(scope.chainPlanId);
    if (plan === null) return null;
    const [chain, season] = await Promise.all([
      ctx.db.get(plan.chainId),
      ctx.db.get(plan.seasonId),
    ]);
    return `${chain?.name ?? "Chain"} plan · ${season?.label ?? "—"}`;
  }
  const promotion = await ctx.db.get(scope.promotionId);
  if (promotion === null) return null;
  const [chain, season] = await Promise.all([
    ctx.db.get(promotion.chainId),
    ctx.db.get(promotion.seasonId),
  ]);
  return `${promotion.name} · ${chain?.name ?? "Chain"} · ${season?.label ?? "—"}`;
}

/**
 * What an audit event records about a scope. The label, so the feed still
 * says *which* promotion was revoked after the assignment row is gone; the
 * tier alone when the record itself has since been deleted.
 */
async function auditLabel(ctx: QueryCtx, scope: AccessScope): Promise<string> {
  return (await labelOf(ctx, scope)) ?? `a deleted ${TIER_LABEL[scope.tier]}`;
}

/** The Administrators who can still sign in — the people who can let everyone back in. */
async function activeAdministrators(ctx: QueryCtx): Promise<Doc<"users">[]> {
  const administrators = await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", "administrator"))
    .collect();
  return administrators.filter(canSignIn);
}

/**
 * Whether this account is the only way back in (#30, story 26). Demoting or
 * deactivating them would leave the deployment governed by nobody, recoverable
 * only from the CLI — so the server refuses, and the UI reads the same answer
 * from here rather than counting rows of its own.
 *
 * An Administrator who cannot sign in is never "the last": they are not a way
 * back in, so removing them takes nothing away — and the one who can must be
 * able to tidy them off the roster.
 */
export async function isLastActiveAdministrator(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<boolean> {
  if (user.role !== "administrator" || !canSignIn(user)) return false;
  return (await activeAdministrators(ctx)).length <= 1;
}

const LAST_ADMINISTRATOR = "This is the last active Administrator. Promote someone else first.";

/**
 * Promote or demote. The role is the whole of an Administrator's access, so
 * demoting the last one is refused here, at the server, whatever the button did.
 *
 * Access Assignments are left alone in both directions: a promoted Member's
 * rows go dormant behind the Administrator's blanket reach, and demoting them
 * again hands back exactly the access they had before.
 */
export async function setUserRole(
  ctx: MutationCtx,
  user: Doc<"users">,
  role: Viewer["role"],
  actor: Actor,
): Promise<boolean> {
  if (user.role === role) return false;
  if (role === "member" && (await isLastActiveAdministrator(ctx, user))) {
    throw new ConvexError(LAST_ADMINISTRATOR);
  }

  await ctx.db.patch(user._id, { role });
  await recordAuditEvent(ctx, {
    action: "role_changed",
    actor,
    subjectUserId: user._id,
    detail: `${user.role} -> ${role}${via(actor)}`,
  });
  return true;
}

/**
 * Offboarding and the return from it (#30, story 25). Deactivation touches one
 * flag and nothing else — role and Access Assignments stay exactly as they were
 * — so reactivation restores the account rather than reassembling it.
 *
 * The next call the account makes is denied, because every wrapper re-reads the
 * flag; there is no session to expire and nothing cached to wait out.
 */
export async function setUserActive(
  ctx: MutationCtx,
  user: Doc<"users">,
  isActive: boolean,
  actor: Actor,
): Promise<boolean> {
  if (user.isActive === isActive) return false;
  if (!isActive && (await isLastActiveAdministrator(ctx, user))) {
    throw new ConvexError(LAST_ADMINISTRATOR);
  }

  await ctx.db.patch(user._id, { isActive });
  await recordAuditEvent(ctx, {
    action: isActive ? "user_activated" : "user_deactivated",
    actor,
    subjectUserId: user._id,
    detail: isActive ? `reactivated${via(actor)}` : `deactivated${via(actor)}`,
  });
  return true;
}

/**
 * Link a User to the Person carrying their RACI history, or unlink them.
 *
 * The link is orientation, never authorization (CONTEXT.md: Person) — it buys
 * the account nothing. Two rules hold it to one meaning: only *internal* People
 * are linkable, because a Distributor or Buyer contact is never an employee
 * with a sign-in; and a Person belongs to at most one User, because "who is
 * this account?" has one answer.
 */
export async function setPersonLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  personId: Id<"people"> | null,
  actor: Actor,
): Promise<boolean> {
  if ((user.personId ?? null) === personId) return false;

  let detail = "unlinked";
  if (personId !== null) {
    const person = await mustGet(ctx, personId, "person");
    const fn = await ctx.db.get(person.functionId);
    if (fn === null || fn.kind !== "internal") {
      throw new ConvexError(
        "Only internal People can be linked to a sign-in — Distributor and Buyer contacts never have one.",
      );
    }
    const taken = await ctx.db
      .query("users")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .first();
    if (taken !== null && taken._id !== user._id) {
      throw new ConvexError(`${person.name} is already linked to another account.`);
    }
    detail = `linked to ${person.name}`;
  }

  // `null` would fail validation; `undefined` is how Convex clears a field.
  await ctx.db.patch(user._id, { personId: personId ?? undefined });
  await recordAuditEvent(ctx, {
    action: "person_linked",
    actor,
    subjectUserId: user._id,
    detail: `${detail}${via(actor)}`,
  });
  return true;
}

/**
 * Look a User up by the Clerk user id on their token. Exported for the
 * deploy-credential functions in `bootstrap.ts`, which have no viewer.
 */
export async function userByClerkId(ctx: QueryCtx, clerkUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();
}

type TokenClaims = Partial<
  Pick<
    Doc<"users">,
    "email" | "emailVerified" | "displayName" | "entraOid" | "entraTid" | "entraUserType"
  >
>;

/**
 * The display and identity fields copied off the token on every sign-in, so a
 * renamed employee lands without a migration.
 *
 * Claims the token does not carry are *absent*, not undefined, because Convex
 * reads `undefined` in a patch as "delete this field" — and a sign-in that
 * happened to carry less than the last one must not erase what was known.
 *
 * The `entra_*` claims arrive only from a SAML enterprise connection, which
 * this deployment does not have (`docs/adr/0003-…`). They are still read
 * because that connection is the documented upgrade path if IT ever engages,
 * and reading a claim nobody sends costs a `typeof` check.
 */
function claimsFrom(identity: UserIdentity): TokenClaims {
  const claims: TokenClaims = {};
  const put = (key: Exclude<keyof TokenClaims, "emailVerified">, value: unknown) => {
    if (typeof value === "string" && value.trim() !== "") {
      claims[key] = value.trim();
    }
  };
  put("email", identity.email);
  // A boolean, so `put`'s string check does not apply; still absent when the
  // token does not carry it, for the same reason.
  if (typeof identity.emailVerified === "boolean") claims.emailVerified = identity.emailVerified;
  put("displayName", identity.name);
  put("entraOid", identity.entra_oid);
  put("entraTid", identity.entra_tid);
  put("entraUserType", identity.entra_usertype);
  return claims;
}

/**
 * First sign-in, and every sign-in after it. Creates exactly one active,
 * zero-assignment Member User per Clerk identity — repeat calls find the
 * existing row and only refresh what the token says, which is how a renamed or
 * re-addressed employee lands without a migration (the shell calls this once
 * per signed-in identity, not only on the first). This is the one mutation an
 * identity without a User row may call; it is still not open, because Convex
 * has already verified the token's signature and issuer before we see it.
 *
 * A deactivated User stays deactivated: signing in is not reactivation. An
 * identity the domain gate does not admit gets no row at all, and the same
 * opaque refusal every other denied call gets.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) deny();

    const claims = claimsFrom(identity);
    const existing = await userByClerkId(ctx, identity.subject);
    if (!admissible(identity)) {
      // An identity with no row gets the same refusal as every other denied
      // call. One we already know gets its row brought up to date instead —
      // the token is verified, and the row is the only record the guard
      // (`canSignIn`) has of whether this account can still get in; without
      // this, an Administrator whose primary address moved outside the domain
      // would be counted as a way back in forever. It answers null rather than
      // throwing, because a thrown mutation is rolled back, patch included.
      if (existing === null) deny();
      await ctx.db.patch(existing._id, claims);
      return null;
    }
    if (existing !== null) {
      await ctx.db.patch(existing._id, { ...claims, lastSignInAt: Date.now() });
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      role: "member",
      isActive: true,
      lastSignInAt: Date.now(),
      ...claims,
    });
    await recordAuditEvent(ctx, {
      action: "user_created",
      actor: { kind: "user", userId },
      subjectUserId: userId,
      detail: "first sign-in",
    });
    return userId;
  },
});

/**
 * Who am I, and what should the shell render? The only public function that
 * answers for a caller who is not a usable viewer, because the sign-in,
 * "access comes next", ineligible and deactivated screens each need a different
 * answer.
 *
 * Nothing here is a permission: every other function re-resolves identity
 * server-side. A client that lies about this result gets a prettier refusal.
 * The gated identity is told its own address and nothing else — no record, no
 * roster, no hint that anything exists behind the gate.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return { state: "anonymous" } as const;
    if (!admissible(identity)) {
      return { state: "ineligible", email: identity.email } as const;
    }

    const user = await userByClerkId(ctx, identity.subject);
    // A verified token with no User row: `ensureUser` has not landed yet.
    if (user === null) return { state: "unregistered" } as const;

    const account = {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      personId: user.personId,
    };
    if (!user.isActive) return { state: "deactivated", account } as const;

    // The Access Assignment roots themselves, not their expansion: the shell
    // only needs to know whether a Member has anything at all, and where a
    // single-Promotion Member should land. An Administrator reaches everything
    // regardless of what is in here.
    const scopes = await scopesOf(ctx, user._id);
    return {
      state: "active",
      account: { ...account, role: user.role },
      scopes,
      landing: landingFor(user.role, scopes),
    } as const;
  },
});
