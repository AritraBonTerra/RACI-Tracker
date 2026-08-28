import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { UserIdentity } from "convex/server";
import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { accessScope } from "./schema";

// The access module (#30). Everything about "who is calling, and may they?"
// lives here, and nothing outside this file may build a bare `query` or
// `mutation` — `accessBoundary.test.ts` enforces that by grep, because a single
// unwrapped function is a hole in the whole boundary.
//
// The shape of the boundary:
//
//   authedQuery / authedMutation   a signed-in, active User; injects `viewer`
//   adminQuery / adminMutation     the same, and `viewer.role` is administrator
//   me                             the one query that answers for callers who
//                                  are *not* signed in, so the UI can render
//                                  the sign-in, no-access and deactivated
//                                  screens. Shaping only — never a gate.
//   ensureUser                     first-sign-in entry point: any verified
//                                  identity may create its own zero-access User
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

/**
 * The identity check, in one place. Returns null for every reason a caller
 * might not be a usable viewer, deliberately without distinguishing them:
 * no token, an unverifiable token (Convex has already dropped those), a token
 * for an identity with no User row yet, or a deactivated User.
 */
async function viewerOrNull(ctx: QueryCtx): Promise<Viewer | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
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

// --- The wrappers ---------------------------------------------------------
// Written against `QueryCtx` and reused for mutations: resolving a viewer only
// ever reads, so the mutation wrappers keep their write access untouched.

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx: QueryCtx) => ({ viewer: await requireViewer(ctx) })),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => ({ viewer: await requireViewer(ctx) })),
);

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx: QueryCtx) => ({ viewer: await requireAdministrator(ctx) })),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx: MutationCtx) => ({
    viewer: await requireAdministrator(ctx),
  })),
);

// --- Reading and writing Users --------------------------------------------

/** The Access Assignment roots of one User, in the public scope shape. */
export async function scopesOf(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<AccessScope[]> {
  const assignments = await ctx.db
    .query("accessAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return assignments.flatMap((assignment): AccessScope[] => {
    if (assignment.seasonId !== undefined) {
      return [{ tier: "season", seasonId: assignment.seasonId }];
    }
    if (assignment.chainPlanId !== undefined) {
      return [{ tier: "chainPlan", chainPlanId: assignment.chainPlanId }];
    }
    if (assignment.promotionId !== undefined) {
      return [{ tier: "promotion", promotionId: assignment.promotionId }];
    }
    // A row with no scope column grants nothing rather than everything.
    return [];
  });
}

/** Writes one row of the access history (CONTEXT.md: Audit event). */
export async function recordAuditEvent(
  ctx: MutationCtx,
  event: Omit<Doc<"auditEvents">, "_id" | "_creationTime">,
) {
  await ctx.db.insert("auditEvents", event);
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
    "email" | "displayName" | "entraOid" | "entraTid" | "entraUserType"
  >
>;

/**
 * The display and identity fields copied off the token on every sign-in, so a
 * renamed employee or a newly-mapped Entra claim lands without a migration.
 *
 * Claims the token does not carry are *absent*, not undefined, because Convex
 * reads `undefined` in a patch as "delete this field" — a development token has
 * no Entra claims at all, and one dev sign-in must not erase what production
 * knew. The `entra_*` claims arrive through Clerk's SAML attribute mapping.
 */
function claimsFrom(identity: UserIdentity): TokenClaims {
  const claims: TokenClaims = {};
  const put = (key: keyof TokenClaims, value: unknown) => {
    if (typeof value === "string" && value.trim() !== "") {
      claims[key] = value.trim();
    }
  };
  put("email", identity.email);
  put("displayName", identity.name);
  put("entraOid", identity.entra_oid);
  put("entraTid", identity.entra_tid);
  put("entraUserType", identity.entra_usertype);
  return claims;
}

/**
 * First sign-in, and every sign-in after it. Creates exactly one active,
 * zero-assignment Member User per Clerk identity — repeat calls find the
 * existing row and only refresh what the token says. This is the one mutation
 * an identity without a User row may call; it is still not open, because Convex
 * has already verified the token's signature and issuer before we see it.
 *
 * A deactivated User stays deactivated: signing in is not reactivation.
 */
export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) deny();

    const claims = claimsFrom(identity);
    const existing = await userByClerkId(ctx, identity.subject);
    if (existing !== null) {
      await ctx.db.patch(existing._id, { ...claims, lastSignInAt: Date.now() });
      return;
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
  },
});

/**
 * Who am I, and what should the shell render? The only public function that
 * answers for a caller who is not a usable viewer, because the sign-in,
 * "access comes next" and deactivated screens each need a different answer.
 *
 * Nothing here is a permission: every other function re-resolves identity
 * server-side. A client that lies about this result gets a prettier refusal.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return { state: "anonymous" } as const;

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

    return {
      state: "active",
      account: { ...account, role: user.role },
      // The Access Assignment roots themselves, not their expansion: the shell
      // only needs to know whether a Member has anything at all, and where a
      // single-Promotion Member should land. An Administrator reaches
      // everything regardless of what is in here.
      scopes: await scopesOf(ctx, user._id),
    } as const;
  },
});
