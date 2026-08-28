import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  recordAuditEvent,
  scopesOf,
  userByClerkId,
  type AccessScope,
} from "./access";
import { accessScope } from "./schema";

// Deploy-credential operations (#30, stories 30/31/34). These are
// `internalMutation` / `internalQuery`, so they are absent from `api` and
// structurally unreachable from any client — no wrapper, no role check, and no
// UI could ever call them. The only way in is `convex run`, which needs the
// deployment's admin key.
//
//   bunx convex run bootstrap:listUsers
//   bunx convex run bootstrap:grantAdmin '{"email":"you@company.com"}'
//   bunx convex run bootstrap:reactivateUser '{"email":"you@company.com"}'
//   bunx convex run bootstrap:grantAccess \
//     '{"email":"them@company.com","scope":{"tier":"promotion","promotionId":"..."}}'
//   bunx convex run bootstrap:revokeAccess '{"email":"them@company.com","scope":{...}}'
//
// Add `--prod` for production. They serve two moments:
//
//   Bootstrap — a fresh deployment has no Administrator, so the first person
//   signs in (creating a zero-access Member) and is promoted from the CLI.
//   There is no authorization gap: nothing grants itself.
//
//   Break-glass — if every Administrator is demoted or deactivated, whoever
//   holds deploy credentials restores one. Keeping two active Administrators
//   means this stays a drill rather than a Tuesday.
//
// The target is always an existing User: sign in first, then promote. Nothing
// here mints an identity, because only Clerk can.

/** Exactly one of the two ways an operator names a User at the CLI. */
const target = {
  email: v.optional(v.string()),
  clerkUserId: v.optional(v.string()),
};

type Target = { email?: string; clerkUserId?: string };

/**
 * Resolve the CLI's `{email}` or `{clerkUserId}` to one User, refusing anything
 * ambiguous. Email is the humane handle but is only as unique as the directory,
 * so a duplicate is an error rather than a coin flip; `clerkUserId` is the
 * unambiguous fallback, and `listUsers` is how you find it.
 */
async function resolveTarget(ctx: QueryCtx, args: Target): Promise<Doc<"users">> {
  const email = args.email?.trim().toLowerCase();
  const clerkUserId = args.clerkUserId?.trim();
  if ((email === undefined) === (clerkUserId === undefined)) {
    throw new ConvexError("Pass exactly one of `email` or `clerkUserId`.");
  }

  if (clerkUserId !== undefined) {
    const user = await userByClerkId(ctx, clerkUserId);
    if (user === null) {
      throw new ConvexError(
        `No User with Clerk id ${clerkUserId}. They have to sign in once first.`,
      );
    }
    return user;
  }

  const matches = (await ctx.db.query("users").collect()).filter(
    (user) => user.email?.toLowerCase() === email,
  );
  if (matches.length === 0) {
    throw new ConvexError(
      `No User with email ${email}. They have to sign in once first — run bootstrap:listUsers to see who has.`,
    );
  }
  if (matches.length > 1) {
    throw new ConvexError(
      `${matches.length} Users share the email ${email}. Pass \`clerkUserId\` instead.`,
    );
  }
  return matches[0];
}

/** What the CLI prints back, so the operator can read the result at a glance. */
function summarize(user: Doc<"users">) {
  return {
    clerkUserId: user.clerkUserId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * The roster, for finding whoever needs promoting and for confirming after a
 * break-glass run that at least two Administrators are active.
 */
export const listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""))
      .map(summarize);
  },
});

/**
 * Promote a User to Administrator, reactivating them in the same step — a
 * deactivated Administrator is not an Administrator, and break-glass has to
 * work when the lockout *was* a deactivation. Idempotent: running it against a
 * sitting Administrator changes nothing and writes no audit event.
 */
export const grantAdmin = internalMutation({
  args: target,
  handler: async (ctx, args) => {
    const user = await resolveTarget(ctx, args);
    if (user.role === "administrator" && user.isActive) {
      return { changed: false, user: summarize(user) };
    }

    await ctx.db.patch(user._id, { role: "administrator", isActive: true });
    if (!user.isActive) await auditActivation(ctx, user);
    if (user.role !== "administrator") {
      await recordAuditEvent(ctx, {
        action: "role_changed",
        actor: { kind: "operator" },
        subjectUserId: user._id,
        detail: `${user.role} -> administrator (deploy credentials)`,
      });
    }
    return {
      changed: true,
      user: summarize({ ...user, role: "administrator", isActive: true }),
    };
  },
});

/**
 * Undo a deactivation. Role and Access Assignments are untouched by
 * deactivation, so restoring the flag restores exactly the prior access.
 */
export const reactivateUser = internalMutation({
  args: target,
  handler: async (ctx, args) => {
    const user = await resolveTarget(ctx, args);
    if (user.isActive) return { changed: false, user: summarize(user) };

    await ctx.db.patch(user._id, { isActive: true });
    await auditActivation(ctx, user);
    return { changed: true, user: summarize({ ...user, isActive: true }) };
  },
});

// --- Access Assignments ---------------------------------------------------
//
// The CLI half of granting, until the Directory surface lands (#34). Same
// semantics the Directory will have — union, idempotent, audited — so the UI
// inherits behavior that has already been exercised rather than defining it.

/** The three columns an assignment can be pinned to, from one scope argument. */
function columnsOf(scope: AccessScope) {
  return {
    seasonId: scope.tier === "season" ? scope.seasonId : undefined,
    chainPlanId: scope.tier === "chainPlan" ? scope.chainPlanId : undefined,
    promotionId: scope.tier === "promotion" ? scope.promotionId : undefined,
  };
}

/** The assignment for exactly this User at exactly this tier, if it exists. */
async function assignmentFor(ctx: QueryCtx, userId: Id<"users">, scope: AccessScope) {
  const columns = columnsOf(scope);
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

/** Refuses a grant naming a record that is not there — a typo, not a scope. */
async function assertScopeExists(ctx: QueryCtx, scope: AccessScope) {
  const target =
    scope.tier === "season"
      ? await ctx.db.get(scope.seasonId)
      : scope.tier === "chainPlan"
        ? await ctx.db.get(scope.chainPlanId)
        : await ctx.db.get(scope.promotionId);
  if (target === null) {
    throw new ConvexError(`No ${scope.tier} with that id — check bootstrap:listUsers.`);
  }
}

/**
 * Give a User access to one Plan Year, Chain Plan or Promotion. Access is the
 * union of a User's assignments, so granting a second overlapping scope is
 * harmless and re-granting the same one is a no-op.
 *
 * Grants go to Members. An Administrator already reaches everything, so an
 * assignment on one is dead weight and is refused rather than silently stored.
 */
export const grantAccess = internalMutation({
  args: { ...target, scope: accessScope },
  handler: async (ctx, args) => {
    const user = await resolveTarget(ctx, args);
    if (user.role === "administrator") {
      throw new ConvexError(
        "Administrators already reach everything — no assignment needed.",
      );
    }
    await assertScopeExists(ctx, args.scope);

    const existing = await assignmentFor(ctx, user._id, args.scope);
    if (existing !== null) {
      return { changed: false, user: summarize(user), scopes: await scopesOf(ctx, user._id) };
    }

    await ctx.db.insert("accessAssignments", {
      userId: user._id,
      ...columnsOf(args.scope),
    });
    await recordAuditEvent(ctx, {
      action: "access_granted",
      actor: { kind: "operator" },
      subjectUserId: user._id,
      detail: `${args.scope.tier} (deploy credentials)`,
    });
    return { changed: true, user: summarize(user), scopes: await scopesOf(ctx, user._id) };
  },
});

/**
 * Take one assignment back. Only that row goes: a Member holding a redundant
 * second grant keeps everything the union still covers, which is what makes
 * overlapping grants safe to hand out (#27, scenario 11).
 */
export const revokeAccess = internalMutation({
  args: { ...target, scope: accessScope },
  handler: async (ctx, args) => {
    const user = await resolveTarget(ctx, args);
    const existing = await assignmentFor(ctx, user._id, args.scope);
    if (existing === null) {
      return { changed: false, user: summarize(user), scopes: await scopesOf(ctx, user._id) };
    }

    await ctx.db.delete(existing._id);
    await recordAuditEvent(ctx, {
      action: "access_revoked",
      actor: { kind: "operator" },
      subjectUserId: user._id,
      detail: `${args.scope.tier} (deploy credentials)`,
    });
    return { changed: true, user: summarize(user), scopes: await scopesOf(ctx, user._id) };
  },
});

async function auditActivation(ctx: MutationCtx, user: Doc<"users">) {
  await recordAuditEvent(ctx, {
    action: "user_activated",
    actor: { kind: "operator" },
    subjectUserId: user._id,
    detail: "reactivated with deploy credentials",
  });
}
