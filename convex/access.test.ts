import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";
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
function token(
  subject: string,
  claims: { name?: string; email?: string; emailVerified?: boolean } = {},
) {
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

// The optional admission gate (#30, story 6, as revised in ADR 0003). Sign-in
// no longer refuses anyone — Clerk admits any Google account and any address
// that can receive a code — so "is this an employee at all?" is asked here,
// from one environment variable on the Convex deployment.
//
// Every identity below carries a *verified* address unless the test is about
// verification, because that is the shape Clerk mints once the runbook's
// `email_verified` claim is mapped.

/** A work address, as the gate is meant to see one. */
const EMPLOYEE = token("user_2emp", {
  name: "Dana Whitfield",
  email: "dana@vctusa.com",
  emailVerified: true,
});

/** A personal Google account: exactly what the SAML design refused at the IdP. */
const OUTSIDER = token("user_2out", {
  name: "Nobody Inparticular",
  email: "nobody@gmail.com",
  emailVerified: true,
});

describe("the email-domain admission gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("unset, any verified sign-in becomes a Member holding nothing", async () => {
    // The deliberate downgrade: a personal account reaches the awaiting-access
    // screen instead of being refused at the identity provider, and holds no
    // data until an Administrator grants it something.
    const t = harness();
    await t.withIdentity(OUTSIDER).mutation(api.access.ensureUser, {});

    expect(await t.withIdentity(OUTSIDER).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: { role: "member" },
      scopes: [],
    });
  });

  test("set, an address at the domain is admitted as it was before", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const t = harness();
    await t.withIdentity(EMPLOYEE).mutation(api.access.ensureUser, {});

    expect(await t.withIdentity(EMPLOYEE).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: { email: "dana@vctusa.com", role: "member" },
    });
  });

  test("set, an address at another domain never becomes an account", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const t = harness();

    await expect(t.withIdentity(OUTSIDER).mutation(api.access.ensureUser, {})).rejects.toThrow(
      DENIED,
    );
    expect(await t.withIdentity(OUTSIDER).query(api.access.me, {})).toEqual({
      state: "ineligible",
      email: "nobody@gmail.com",
    });
    expect(await wrapperResults(t.withIdentity(OUTSIDER))).toEqual(REFUSED_EVERYWHERE);
  });

  test("set, a look-alike domain is outside it", async () => {
    // `endsWith(domain)` alone would admit both of these, which is why the
    // check is on `@<domain>`.
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const t = harness();

    for (const email of ["mallory@notvctusa.com", "mallory@vctusa.com.attacker.net"]) {
      const impostor = token(`user_${email}`, { email, emailVerified: true });
      await expect(t.withIdentity(impostor).mutation(api.access.ensureUser, {})).rejects.toThrow(
        DENIED,
      );
      expect(await t.withIdentity(impostor).query(api.access.me, {})).toMatchObject({
        state: "ineligible",
      });
    }
  });

  test("set, an unverified address at the domain is not an address", async () => {
    // Anyone can type an employer's domain into a sign-up form. Only the
    // identity provider can say the inbox answered.
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const t = harness();
    const unverified = token("user_2unv", { email: "dana@vctusa.com" });

    await expect(t.withIdentity(unverified).mutation(api.access.ensureUser, {})).rejects.toThrow(
      DENIED,
    );
    expect(await wrapperResults(t.withIdentity(unverified))).toEqual(REFUSED_EVERYWHERE);
  });

  test("set, the domain is read as written however it was pasted in", async () => {
    // The value is copied out of a dashboard by hand, and `@VCTUSA.com ` is a
    // plausible thing to paste.
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", " @VCTUSA.com ");
    const t = harness();
    await t.withIdentity(EMPLOYEE).mutation(api.access.ensureUser, {});

    expect(await t.withIdentity(EMPLOYEE).query(api.access.me, {})).toMatchObject({
      state: "active",
    });
  });

  test("turned on afterwards, it locks out the account it would not have admitted", async () => {
    // The gate is re-read on every call, not only at admission — otherwise
    // setting it would govern the future and leave the past signed in.
    const t = harness();
    await t.withIdentity(OUTSIDER).mutation(api.access.ensureUser, {});
    await t.mutation(internal.bootstrap.grantAdmin, { email: "nobody@gmail.com" });
    expect(await wrapperResults(t.withIdentity(OUTSIDER))).toMatchObject({
      adminQuery: "administrator",
    });

    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");

    expect(await wrapperResults(t.withIdentity(OUTSIDER))).toEqual(REFUSED_EVERYWHERE);
  });

  test("turned on afterwards, it stops counting the Administrators it locked out", async () => {
    // The last-Administrator guard (#30, story 26) is about who can still get
    // in. An outside-domain Administrator from before the gate cannot, so they
    // must not keep the count above one — or the one admitted Administrator
    // could step down and leave the deployment governed by nobody.
    const t = harness();
    for (const who of [OUTSIDER, EMPLOYEE]) {
      await t.withIdentity(who).mutation(api.access.ensureUser, {});
      await t.mutation(internal.bootstrap.grantAdmin, { email: who.email });
    }
    const asEmployee = t.withIdentity(EMPLOYEE);
    const me = await asEmployee.query(api.access.me, {});
    if (me.state !== "active") throw new Error(`expected an active viewer, got ${me.state}`);
    expect((await asEmployee.query(api.directory.roster, {})).activeAdministrators).toBe(2);

    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");

    expect((await asEmployee.query(api.directory.roster, {})).activeAdministrators).toBe(1);
    await expect(
      asEmployee.mutation(api.directory.setRole, { userId: me.account.id, role: "member" }),
    ).rejects.toThrow(/last active Administrator/);
    await expect(
      asEmployee.mutation(api.directory.setActive, { userId: me.account.id, isActive: false }),
    ).rejects.toThrow(/last active Administrator/);
  });

  test("an Administrator whose address moved outside the domain stops counting once they knock", async () => {
    // The guard reads the address the row last saw. A primary address changed
    // in Clerk is only observable when that identity next presents a token —
    // refused, but the row learns the new address on the way, so the guard
    // stops counting an Administrator who can no longer get in.
    const t = harness();
    const sasha = token("user_2sasha", {
      name: "Sasha Kim",
      email: "sasha@vctusa.com",
      emailVerified: true,
    });
    for (const who of [EMPLOYEE, sasha]) {
      await t.withIdentity(who).mutation(api.access.ensureUser, {});
      await t.mutation(internal.bootstrap.grantAdmin, { email: who.email });
    }
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const asEmployee = t.withIdentity(EMPLOYEE);
    expect((await asEmployee.query(api.directory.roster, {})).activeAdministrators).toBe(2);

    const moved = token("user_2sasha", {
      name: "Sasha Kim",
      email: "sasha@gmail.com",
      emailVerified: true,
    });
    expect(await t.withIdentity(moved).mutation(api.access.ensureUser, {})).toBeNull();
    expect(await wrapperResults(t.withIdentity(moved))).toEqual(REFUSED_EVERYWHERE);

    const roster = await asEmployee.query(api.directory.roster, {});
    expect(roster.activeAdministrators).toBe(1);
    const me = await asEmployee.query(api.access.me, {});
    if (me.state !== "active") throw new Error(`expected an active viewer, got ${me.state}`);
    await expect(
      asEmployee.mutation(api.directory.setRole, { userId: me.account.id, role: "member" }),
    ).rejects.toThrow(/last active Administrator/);

    // And the one who can still get in may tidy the other off the roster: an
    // Administrator who cannot sign in is not "the last", whatever their row says.
    const sashaId = roster.accounts.find((account) => account.email === "sasha@gmail.com")?.userId;
    if (sashaId === undefined) throw new Error("expected Sasha on the roster");
    expect(await asEmployee.query(api.directory.account, { userId: sashaId })).toMatchObject({
      isLastActiveAdministrator: false,
    });
    expect(
      await asEmployee.mutation(api.directory.setActive, { userId: sashaId, isActive: false }),
    ).toBe(true);
  });

  test("turned on afterwards, it takes the accounts it locked out off the awaiting queue", async () => {
    // An account the gate refuses never reaches the "access comes next"
    // screen, so it is not waiting there — and the badge must not say it is.
    const t = harness();
    await t.withIdentity(OUTSIDER).mutation(api.access.ensureUser, {});
    await t.withIdentity(EMPLOYEE).mutation(api.access.ensureUser, {});
    await t.mutation(internal.bootstrap.grantAdmin, { email: EMPLOYEE.email });
    const asEmployee = t.withIdentity(EMPLOYEE);
    expect(await asEmployee.query(api.directory.awaitingCount, {})).toBe(1);

    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");

    expect(await asEmployee.query(api.directory.awaitingCount, {})).toBe(0);
    const roster = await asEmployee.query(api.directory.roster, {});
    expect(roster.accounts.find((account) => account.email === OUTSIDER.email)).toMatchObject({
      awaitingAccess: false,
    });
  });

  test("a gated caller is refused in the same words as everyone else", async () => {
    // The gate must not become an oracle for "is this address an employee?".
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "vctusa.com");
    const t = harness();
    await t.withIdentity(EMPLOYEE).mutation(api.access.ensureUser, {});

    const messages = [
      await refusal(() => harness().query(probe.authedQuery, {})),
      await refusal(() => t.withIdentity(OUTSIDER).query(probe.authedQuery, {})),
      await refusal(() => t.withIdentity(OUTSIDER).mutation(api.access.ensureUser, {})),
      // An admitted employee is still only a Member: the gate buys nothing.
      await refusal(() => t.withIdentity(EMPLOYEE).query(probe.adminQuery, {})),
    ];

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toContain(DENIED);
  });
});

/** The one sentence every refusal in the app comes back with. */
const DENIED = "You don't have access to this.";

/** What all four wrappers say to a caller the boundary does not admit. */
const REFUSED_EVERYWHERE = {
  authedQuery: "refused",
  adminQuery: "refused",
  authedMutation: "refused",
  adminMutation: "refused",
};

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
