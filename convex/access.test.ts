import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

// The repo's first tests, and the seam every later access test uses: calls go
// through the public Convex function surface with an identity injected, exactly
// as the browser would make them. Nothing here reaches into a table to check a
// result — if a behavior is not observable to a caller, it is not asserted.
//
// Internal (deploy-credential) functions are invoked directly, the way
// `convex run` invokes them.

// Every module the functions under test might import. Test files are excluded:
// Convex never deploys them, and they are not part of the surface.
const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.*"]);

const CLERK_ISSUER = "https://tidy-marmoset-42.clerk.accounts.dev";

/** A Clerk session token, as Convex would hand it to a function. */
function token(subject: string, claims: { name?: string; email?: string } = {}) {
  return { subject, issuer: CLERK_ISSUER, ...claims };
}

const ALICE = token("user_2alice", {
  name: "Alice Moreno",
  email: "alice@vctusa.com",
});
const BEN = token("user_2ben", { name: "Ben Ortiz", email: "ben@vctusa.com" });

function harness() {
  return convexTest(schema, modules);
}

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
