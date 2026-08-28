import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { CLERK_ISSUER, harness } from "./world.fixture";

// The repo's first tests, and the seam every later access test uses: calls go
// through the public Convex function surface with an identity injected, exactly
// as the browser would make them. Nothing here reaches into a table to check a
// result — if a behavior is not observable to a caller, it is not asserted.
//
// Internal (deploy-credential) functions are invoked directly, the way
// `convex run` invokes them.

/**
 * A Clerk session token, as Convex would hand it to a function. Its own builder
 * rather than `world.fixture`'s: these tests are about what happens when a claim
 * is *missing*, so every claim here is optional.
 */
function token(subject: string, claims: { name?: string; email?: string } = {}) {
  return { subject, issuer: CLERK_ISSUER, ...claims };
}

const ALICE = token("user_2alice", {
  name: "Alice Moreno",
  email: "alice@vctusa.com",
});
const BEN = token("user_2ben", { name: "Ben Ortiz", email: "ben@vctusa.com" });

/**
 * The four wrappers, addressed the way a real module would be. They are the
 * only authorization the app has, so they are exercised through
 * `access.fixture.ts` rather than trusted — see that file for why it is not a
 * deployed module and therefore not in `api`.
 */
type Role = "administrator" | "member";
const probe = {
  authedQuery: makeFunctionReference<"query", Record<string, never>, Role>(
    "access.fixture:viewerRole",
  ),
  adminQuery: makeFunctionReference<"query", Record<string, never>, Role>(
    "access.fixture:administratorRole",
  ),
  authedMutation: makeFunctionReference<"mutation", Record<string, never>, Role>(
    "access.fixture:writeAsViewer",
  ),
  adminMutation: makeFunctionReference<"mutation", Record<string, never>, Role>(
    "access.fixture:writeAsAdministrator",
  ),
};

describe("anonymous callers", () => {
  test("me reports the caller is signed out, with no account attached", async () => {
    const t = harness();
    expect(await t.query(api.access.me, {})).toEqual({ state: "anonymous" });
  });

  test("ensureUser refuses a caller with no identity", async () => {
    const t = harness();
    await expect(t.mutation(api.access.ensureUser, {})).rejects.toThrow();
  });

  test("an anonymous caller cannot see a signed-in employee's account", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});

    const anonymous = await t.query(api.access.me, {});
    expect(anonymous).toEqual({ state: "anonymous" });
    // Belt and braces: nothing about Alice reaches an anonymous caller.
    expect(JSON.stringify(anonymous)).not.toContain("alice");
  });
});

describe("first sign-in", () => {
  test("creates exactly one active Member with no Access Assignments", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});

    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: {
        role: "member",
        email: "alice@vctusa.com",
        displayName: "Alice Moreno",
      },
      scopes: [],
    });
    expect(await t.query(internal.bootstrap.listUsers, {})).toEqual([
      {
        clerkUserId: ALICE.subject,
        email: "alice@vctusa.com",
        displayName: "Alice Moreno",
        role: "member",
        isActive: true,
      },
    ]);
  });

  test("a verified token with no User yet reads as unregistered, not signed out", async () => {
    const t = harness();
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toEqual({
      state: "unregistered",
    });
  });

  test("repeat sign-ins reuse the same User and refresh what the token says", async () => {
    const t = harness();
    const asAlice = t.withIdentity(ALICE);
    await asAlice.mutation(api.access.ensureUser, {});
    const first = await asAlice.query(api.access.me, {});

    await t
      .withIdentity(token(ALICE.subject, { name: "Alice Moreno-Diaz", email: ALICE.email }))
      .mutation(api.access.ensureUser, {});

    const roster = await t.query(internal.bootstrap.listUsers, {});
    expect(roster).toHaveLength(1);
    expect(roster[0].displayName).toBe("Alice Moreno-Diaz");
    // Same User record, not a second one wearing a new name.
    expect(await asAlice.query(api.access.me, {})).toMatchObject({
      account: { id: (first as { account: { id: string } }).account.id },
    });
  });

  test("a sign-in whose token carries no display claims still creates the User", async () => {
    // A Clerk instance without the email claim mapped yet: the account is real
    // and usable, it just has nothing to show but its Clerk id.
    const t = harness();
    const asGhost = t.withIdentity(token("user_2ghost"));
    await asGhost.mutation(api.access.ensureUser, {});

    const result = await asGhost.query(api.access.me, {});
    expect(result).toMatchObject({ state: "active", account: { role: "member" } });
    expect(await t.query(internal.bootstrap.listUsers, {})).toMatchObject([
      { clerkUserId: "user_2ghost", isActive: true },
    ]);
  });

  test("two employees get two Users", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await t.withIdentity(BEN).mutation(api.access.ensureUser, {});

    expect(await t.query(internal.bootstrap.listUsers, {})).toHaveLength(2);
  });
});

describe("a deactivated account", () => {
  test("reads as deactivated and signing in again does not restore it", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await deactivate(t, ALICE.subject);

    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});

    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "deactivated",
      account: { email: "alice@vctusa.com" },
    });
    expect(await t.query(internal.bootstrap.listUsers, {})).toMatchObject([
      { isActive: false, role: "member" },
    ]);
  });

  test("carries no role, so the shell cannot render an Administrator's chrome", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });
    await deactivate(t, ALICE.subject);

    const result = await t.withIdentity(ALICE).query(api.access.me, {});
    expect(result.state).toBe("deactivated");
    expect(JSON.stringify(result)).not.toContain("administrator");
  });
});

describe("the wrappers every guarded function will be built from", () => {
  test("refuse an anonymous caller at all four doors", async () => {
    expect(await wrapperResults(harness())).toEqual({
      authedQuery: "refused",
      adminQuery: "refused",
      authedMutation: "refused",
      adminMutation: "refused",
    });
  });

  test("refuse a verified token that has no User record yet", async () => {
    // Signed in as far as Clerk is concerned, unknown as far as we are.
    const t = harness();
    expect(await wrapperResults(t.withIdentity(ALICE))).toEqual({
      authedQuery: "refused",
      adminQuery: "refused",
      authedMutation: "refused",
      adminMutation: "refused",
    });
  });

  test("let a Member through the authed pair and refuse the Administrator pair", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});

    expect(await wrapperResults(t.withIdentity(ALICE))).toEqual({
      authedQuery: "member",
      authedMutation: "member",
      adminQuery: "refused",
      adminMutation: "refused",
    });
  });

  test("let an Administrator through all four", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });

    expect(await wrapperResults(t.withIdentity(ALICE))).toEqual({
      authedQuery: "administrator",
      adminQuery: "administrator",
      authedMutation: "administrator",
      adminMutation: "administrator",
    });
  });

  test("refuse a deactivated Member everywhere", async () => {
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await deactivate(t, ALICE.subject);

    expect(await wrapperResults(t.withIdentity(ALICE))).toEqual({
      authedQuery: "refused",
      adminQuery: "refused",
      authedMutation: "refused",
      adminMutation: "refused",
    });
  });

  test("refuse a deactivated Administrator everywhere", async () => {
    // Offboarding outranks the role: the Administrator bit is still set, and
    // it buys nothing.
    const t = harness();
    await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });
    await deactivate(t, ALICE.subject);

    expect(await wrapperResults(t.withIdentity(ALICE))).toEqual({
      authedQuery: "refused",
      adminQuery: "refused",
      authedMutation: "refused",
      adminMutation: "refused",
    });
  });

  test("say the same thing however the caller was refused", async () => {
    // A refusal that named the reason would tell an outsider whether an email
    // is an employee, and a Member whether a function is Administrator-only.
    const t = harness();
    await t.withIdentity(BEN).mutation(api.access.ensureUser, {});
    await deactivate(t, BEN.subject);

    const messages = [
      await refusal(() => harness().query(probe.authedQuery, {})),
      await refusal(() => t.withIdentity(ALICE).query(probe.authedQuery, {})),
      await refusal(() => t.withIdentity(BEN).query(probe.authedQuery, {})),
      await refusal(() => t.withIdentity(BEN).query(probe.adminQuery, {})),
    ];

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toContain("You don't have access to this.");
  });
});

/** A caller — anonymous or carrying an identity — as the wrapper tests use it. */
type Caller = Pick<ReturnType<typeof harness>, "query" | "mutation">;

/**
 * Every wrapper called with one identity: the role it injected, or `"refused"`.
 * One shape per caller means a test states the whole boundary at once, and a
 * wrapper that silently starts letting people through fails an equality check
 * rather than going unnoticed.
 */
async function wrapperResults(caller: Caller) {
  const attempt = async (call: () => Promise<string>) => {
    try {
      return await call();
    } catch {
      return "refused";
    }
  };
  return {
    authedQuery: await attempt(() => caller.query(probe.authedQuery, {})),
    adminQuery: await attempt(() => caller.query(probe.adminQuery, {})),
    authedMutation: await attempt(() => caller.mutation(probe.authedMutation, {})),
    adminMutation: await attempt(() => caller.mutation(probe.adminMutation, {})),
  };
}

/** The message a refused call came back with — failing loudly if it succeeded. */
async function refusal(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected the call to be refused, but it succeeded.");
}

/**
 * Offboarding has no public mutation until the Directory slice, so the flag is
 * flipped directly here. Setup only — every assertion above goes through the
 * function surface.
 */
async function deactivate(t: ReturnType<typeof harness>, clerkUserId: string) {
  await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (user === null) throw new Error(`No User for ${clerkUserId}`);
    await ctx.db.patch(user._id, { isActive: false });
  });
}
