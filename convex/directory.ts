import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  adminMutation,
  adminQuery,
  authedQuery,
  expandScopes,
  grantScope,
  isLastActiveAdministrator,
  revokeScope,
  scopeOfAssignment,
  scopesOf,
  setPersonLink,
  setUserActive,
  setUserRole,
  type AccessScope,
  type Reach,
} from "./access";
import { fromUrl, memo, mustGet } from "./model";
import { accessScope, userRole } from "./schema";

// The Directory (#34): the one surface an Administrator runs access from —
// the roster, one account's whole story, and the audit feed underneath it.
//
// Everything here is behind `adminQuery` / `adminMutation`, so a Member calling
// any of it gets the same opaque refusal they get for a function that does not
// concern them. `myAccess` is the single exception and the reason it exists: a
// Member is entitled to know their own role and scopes, and nothing else.
//
// The decisions all live in `access.ts` — this module loads, shapes and names
// things for the screen. That split is deliberate: the last-Administrator
// guard, the union semantics and the Audit events belong to the access model,
// which the deploy-credential CLI shares, and a second implementation living
// behind the buttons would be a second set of rules.

/** What an account goes by when the token carried no name. */
function nameOf(user: Doc<"users">): string {
  return user.displayName ?? user.email ?? "Unnamed account";
}

// --- Scopes, named --------------------------------------------------------

/** The whole hierarchy, once, for the scope picker and the preview tree. */
async function hierarchy(ctx: QueryCtx) {
  const [seasons, plans, chains, promotions] = await Promise.all([
    ctx.db.query("seasons").collect(),
    ctx.db.query("chainPlans").collect(),
    ctx.db.query("chains").collect(),
    ctx.db.query("promotions").collect(),
  ]);
  const chainName = new Map(chains.map((chain) => [chain._id, chain.name]));

  return seasons
    .sort((a, b) => b.year - a.year)
    .map((season) => ({
      season,
      plans: plans
        .filter((plan) => plan.seasonId === season._id)
        .map((plan) => ({
          plan,
          chain: chainName.get(plan.chainId) ?? "Unknown chain",
          promotions: promotions
            .filter((promotion) => promotion.chainPlanId === plan._id)
            .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        }))
        .sort((a, b) => a.chain.localeCompare(b.chain)),
    }));
}

/**
 * The label one scope goes by in the grants list, the audit feed and the
 * Member's own "what do I have?" — always naming the tier above it, because
 * "Holiday Endcap" without its chain is two promotions in a busy year.
 */
async function labelOf(ctx: QueryCtx, scope: AccessScope): Promise<string | null> {
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
  const chain = await ctx.db.get(promotion.chainId);
  return `${promotion.name} · ${chain?.name ?? "Chain"}`;
}

/** A User's live grants, with who made each one and when. */
async function grantsOf(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("accessAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const userOf = memo<"users">(ctx);

  const grants = await Promise.all(
    rows.map(async (row) => {
      const scope = scopeOfAssignment(row);
      if (scope === null) return [];

      // A grant pointing at a deleted record is not access, so it is not shown
      // as any — same rule `scopesOf` applies when expanding one.
      const label = await labelOf(ctx, scope);
      if (label === null) return [];

      const grantedBy = row.grantedBy === undefined ? null : await userOf(row.grantedBy);
      return [
        {
          scope,
          label,
          grantedAt: row._creationTime,
          // Null for a grant made with deploy credentials, which has no account
          // behind it to name.
          grantedByName: grantedBy === null ? null : nameOf(grantedBy),
        },
      ];
    }),
  );
  return grants.flat();
}

// --- The roster -----------------------------------------------------------

/**
 * The awaiting-access queue, as one predicate (CONTEXT.md: awaiting access):
 * signed in, still here, and holding nothing. The roster pill and the sidebar
 * badge are two queries — the badge must not pull the whole roster — so the
 * definition lives here rather than being written twice and drifting.
 *
 * An Administrator is never awaiting: the role reaches everything, so an
 * Administrator with no assignment rows is not waiting on anyone.
 */
function isAwaitingAccess(user: Doc<"users">, scopes: readonly AccessScope[]): boolean {
  return user.isActive && user.role === "member" && scopes.length === 0;
}

/** Everything the roster row and the detail header both need. */
async function summarize(ctx: QueryCtx, user: Doc<"users">) {
  const person = user.personId === undefined ? null : await ctx.db.get(user.personId);
  const scopes = await scopesOf(ctx, user._id);
  return {
    userId: user._id,
    name: nameOf(user),
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    person: person === null ? null : { personId: person._id, name: person.name },
    grantCount: scopes.length,
    // The account sitting on the "access comes next" screen (#30, story 20).
    awaitingAccess: isAwaitingAccess(user, scopes),
    firstSignInAt: user._creationTime,
    lastSignInAt: user.lastSignInAt,
  };
}

type RosterEntry = Awaited<ReturnType<typeof summarize>>;

/** Queue first, then everyone still here, then the offboarded. */
function rosterOrder(entry: RosterEntry): number {
  if (!entry.isActive) return 2;
  return entry.awaitingAccess ? 0 : 1;
}

/**
 * The account roster. Everyone who has ever signed in, in the order an
 * Administrator works down it: whoever is waiting on access, then the people
 * already working, then the offboarded.
 */
export const roster = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const accounts = await Promise.all(users.map((user) => summarize(ctx, user)));
    accounts.sort(
      (a, b) => rosterOrder(a) - rosterOrder(b) || a.name.localeCompare(b.name),
    );
    return {
      accounts,
      awaitingCount: accounts.filter((entry) => entry.awaitingAccess).length,
      // Drives the "add another Administrator before…" warning, so the UI can
      // explain the refusal before anyone runs into it.
      activeAdministrators: accounts.filter(
        (entry) => entry.isActive && entry.role === "administrator",
      ).length,
    };
  },
});

/**
 * The badge on the Directory's nav entry. Its own query rather than a slice of
 * the roster, so the sidebar — on every page — does not pull the whole surface.
 */
export const awaitingCount = adminQuery({
  args: {},
  handler: async (ctx) => {
    // Expanding scopes is the expensive half, and only an active Member can be
    // awaiting, so the cheap half of the predicate narrows the set first.
    const members = (await ctx.db.query("users").collect()).filter(
      (user) => user.isActive && user.role === "member",
    );
    const scopes = await Promise.all(members.map((user) => scopesOf(ctx, user._id)));
    return members.filter((user, index) => isAwaitingAccess(user, scopes[index])).length;
  },
});

// --- Person-link candidates -----------------------------------------------

/**
 * The internal People this account might be (#30, story 21). Two ways to
 * match — the email on the Person record, and the words in the account's name —
 * so an Administrator connects a sign-in to the Person already carrying its
 * RACI history instead of creating a duplicate.
 *
 * Distributor and Buyer People are never offered, at any strength of match:
 * they are external contacts and structurally cannot hold a sign-in
 * (CONTEXT.md: Person). People already linked to another account are left out
 * too — the link is one-to-one.
 */
async function candidatesFor(ctx: QueryCtx, user: Doc<"users">) {
  const functions = await ctx.db.query("functions").collect();
  const internal = new Map(
    functions.filter((fn) => fn.kind === "internal").map((fn) => [fn._id, fn]),
  );

  const linked = new Set(
    (await ctx.db.query("users").collect()).flatMap((other) =>
      other._id === user._id || other.personId === undefined ? [] : [other.personId],
    ),
  );

  const email = user.email?.trim().toLowerCase();
  // The account's name, plus the local part of its address split on the
  // punctuation corporate addresses use: "sam.rivera@" is two useful words.
  const words = new Set(
    `${user.displayName ?? ""} ${(email ?? "").split("@")[0].replace(/[._-]+/g, " ")}`
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 1),
  );

  const people = await ctx.db.query("people").collect();
  return people
    .flatMap((person) => {
      const fn = internal.get(person.functionId);
      if (fn === undefined || linked.has(person._id)) return [];

      const sameEmail =
        email !== undefined && person.email?.trim().toLowerCase() === email;
      const name = person.name.toLowerCase();
      const byName = [...words].some((word) => name.includes(word));
      if (!sameEmail && !byName) return [];

      return [
        {
          personId: person._id,
          name: person.name,
          title: person.title,
          functionName: fn.name,
          // Ranked, because an exact address is a fact and a shared first name
          // is a guess.
          reason: sameEmail ? ("email" as const) : ("name" as const),
        },
      ];
    })
    .sort((a, b) =>
      a.reason === b.reason ? a.name.localeCompare(b.name) : a.reason === "email" ? -1 : 1,
    );
}

// --- One account's whole story --------------------------------------------

/**
 * The detail pane: identity, Person link and its candidates, role, grants, and
 * whether this is the account the deployment cannot afford to lose.
 *
 * Answers `null` for an id that no longer resolves — and for a forged one,
 * because the id arrives as a string and is normalized rather than trusted. A
 * deleted account and a made-up one are the same nothing.
 */
export const account = adminQuery({
  // A string, not `v.id`: the id comes from the client (model.ts: fromUrl).
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await fromUrl(ctx, "users", args.userId);
    if (user === null) return null;

    const summary = await summarize(ctx, user);
    return {
      ...summary,
      grants: await grantsOf(ctx, user._id),
      // Candidates hang off the Person that actually resolved, not off the id
      // stored on the account. `people.remove` refuses to delete a linked
      // Person, but a link left dangling by anything else has to be repairable
      // from this pane rather than being a permanent, buttonless nothing.
      candidates: summary.person === null ? await candidatesFor(ctx, user) : [],
      isLastActiveAdministrator: await isLastActiveAdministrator(ctx, user),
    };
  },
});

/**
 * What one account sees across the whole hierarchy — optionally with a grant
 * that has not been made yet folded in, which is the effective-access preview
 * the grant flow shows before anyone confirms (#30, story 22).
 *
 * The reach on every node comes from `expandScopes`, the same function that
 * decides what the account actually gets. A preview computed any other way
 * would be a second opinion about access, and the wrong one eventually.
 *
 * With no `userId` it is just the hierarchy with its names — the scope picker
 * reads it that way.
 */
export const effectiveAccess = adminQuery({
  args: { userId: v.optional(v.string()), adding: v.optional(accessScope) },
  handler: async (ctx, args) => {
    const user =
      args.userId === undefined ? null : await fromUrl(ctx, "users", args.userId);

    // An Administrator reaches everything by role, so their tree is not built
    // from assignments. Deactivation is deliberately not folded in: the pane
    // shows the access a reactivation would hand straight back.
    const everything = user?.role === "administrator";
    const scope = everything
      ? null
      : await expandScopes(ctx, [
          ...(user === null ? [] : await scopesOf(ctx, user._id)),
          ...(args.adding === undefined ? [] : [args.adding]),
        ]);

    const reachOf = {
      season: (id: Id<"seasons">): Reach =>
        everything ? "full" : (scope?.season(id) ?? "none"),
      plan: (plan: Doc<"chainPlans">): Reach =>
        everything ? "full" : (scope?.chainPlan(plan) ?? "none"),
      promotion: (promotion: Doc<"promotions">): Reach =>
        everything ? "full" : (scope?.promotion(promotion) ?? "none"),
    };

    return (await hierarchy(ctx)).map(({ season, plans }) => ({
      seasonId: season._id,
      label: `Plan Year ${season.label}`,
      reach: reachOf.season(season._id),
      plans: plans.map(({ plan, chain, promotions }) => ({
        chainPlanId: plan._id,
        label: chain,
        reach: reachOf.plan(plan),
        promotions: promotions.map((promotion) => ({
          promotionId: promotion._id,
          label: promotion.name,
          reach: reachOf.promotion(promotion),
        })),
      })),
    }));
  },
});

// --- The audit feed -------------------------------------------------------

const FEED_LIMIT = 50;

/**
 * The access history, newest first, kept indefinitely (CONTEXT.md: Audit
 * event). Scoped to one account when asked, which is how the detail pane shows
 * "what has been done to this person" without the whole company's activity.
 *
 * Actor and subject are resolved to names here: an audit feed reading
 * "usr_2f8… changed usr_9b1…" answers nobody's question.
 */
export const auditFeed = adminQuery({
  args: { userId: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? FEED_LIMIT, 1), 200);
    const subject =
      args.userId === undefined ? null : await fromUrl(ctx, "users", args.userId);
    if (args.userId !== undefined && subject === null) return [];

    const events =
      subject === null
        ? await ctx.db.query("auditEvents").order("desc").take(limit)
        : await ctx.db
            .query("auditEvents")
            .withIndex("by_subject", (q) => q.eq("subjectUserId", subject._id))
            .order("desc")
            .take(limit);

    const userOf = memo<"users">(ctx);
    return await Promise.all(
      events.map(async (event) => {
        const actor =
          event.actor.kind === "user" ? await userOf(event.actor.userId) : null;
        const target = await userOf(event.subjectUserId);
        return {
          id: event._id,
          action: event.action,
          detail: event.detail,
          at: event._creationTime,
          // Null for an action taken with deploy credentials — bootstrap and
          // break-glass are actions too, and the feed says so rather than
          // leaving a hole where the first Administrator came from.
          actorName: actor === null ? null : nameOf(actor),
          subjectName: target === null ? "A deleted account" : nameOf(target),
        };
      }),
    );
  },
});

// --- What a Member may ask about themselves -------------------------------

/**
 * The viewer's own role and scopes, named (#30, story 17). The one function on
 * this surface a Member may call, and it answers only about them: no roster, no
 * other account's grants, no audit trail.
 */
export const myAccess = authedQuery({
  args: {},
  handler: async (ctx) => {
    const scopes = await scopesOf(ctx, ctx.viewer._id);
    const labels = await Promise.all(scopes.map((scope) => labelOf(ctx, scope)));
    return {
      role: ctx.viewer.role,
      scopes: labels.flatMap((label, index) =>
        label === null ? [] : [{ tier: scopes[index].tier, label }],
      ),
    };
  },
});

// --- Administering an account ---------------------------------------------
// Each of these loads the account, hands it to the access model, and returns
// what changed. The rules — the last-Administrator guard, union semantics,
// internal-People-only, and the Audit event every one of them writes — are in
// `access.ts`, shared with the deploy-credential CLI.

/** The Administrator behind a Directory action, as the Audit event records it. */
function actorOf(viewerId: Id<"users">) {
  return { kind: "user", userId: viewerId } as const;
}

/**
 * Promote or demote. Refused for the last active Administrator, here rather
 * than only in the UI: the button being hidden is a courtesy, this is the rule.
 */
export const setRole = adminMutation({
  args: { userId: v.id("users"), role: userRole },
  handler: async (ctx, args) => {
    const user = await mustGet(ctx, args.userId, "account");
    return await setUserRole(ctx, user, args.role, actorOf(ctx.viewer._id));
  },
});

/**
 * Offboard an account, or bring one back. Deactivation denies the account's
 * very next call — every wrapper re-reads the flag — and leaves role and grants
 * intact, so reactivation restores exactly what they had.
 */
export const setActive = adminMutation({
  args: { userId: v.id("users"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const user = await mustGet(ctx, args.userId, "account");
    return await setUserActive(ctx, user, args.isActive, actorOf(ctx.viewer._id));
  },
});

/** Connect a sign-in to the Person carrying its RACI history, or disconnect it. */
export const linkPerson = adminMutation({
  args: { userId: v.id("users"), personId: v.union(v.id("people"), v.null()) },
  handler: async (ctx, args) => {
    const user = await mustGet(ctx, args.userId, "account");
    return await setPersonLink(ctx, user, args.personId, actorOf(ctx.viewer._id));
  },
});

/** Grant one Plan Year, Chain Plan or Promotion. Idempotent, union semantics. */
export const grant = adminMutation({
  args: { userId: v.id("users"), scope: accessScope },
  handler: async (ctx, args) => {
    const user = await mustGet(ctx, args.userId, "account");
    return await grantScope(ctx, user, args.scope, actorOf(ctx.viewer._id));
  },
});

/** Take one grant back. The rest of the union is untouched. */
export const revoke = adminMutation({
  args: { userId: v.id("users"), scope: accessScope },
  handler: async (ctx, args) => {
    const user = await mustGet(ctx, args.userId, "account");
    return await revokeScope(ctx, user, args.scope, actorOf(ctx.viewer._id));
  },
});
