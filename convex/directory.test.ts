import type { FunctionReturnType } from "convex/server";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ADMIN,
  NEWCOMER,
  PLAN_MEMBER,
  PROMO_MEMBER,
  TODAY,
  YEAR_MEMBER,
  bytes,
  token,
  world,
  type Caller,
} from "./world.fixture";

// The Directory (#34), asserted the way every other slice on this branch is:
// through the public function surface, with an identity injected, looking only
// at what a caller gets back. No test here reaches into `users` or
// `accessAssignments` to check a result — deactivation is proved by the account
// being denied, a grant by the Member seeing their promotion, an audit event by
// its appearing in the feed.
//
// The world is `world.fixture.ts`, shared with the read and write matrices, so
// "Sam gets the Kroger plan" is a claim about a plan that other tests also
// argue over.

/** The five roles the Directory can be called with, one shape per caller. */
async function directoryReads(caller: Caller, userId: Id<"users">) {
  const attempt = async <T>(call: () => Promise<T>) => {
    try {
      return await call();
    } catch {
      return "refused" as const;
    }
  };
  return {
    roster: await attempt(() => caller.query(api.directory.roster, {})),
    awaitingCount: await attempt(() => caller.query(api.directory.awaitingCount, {})),
    account: await attempt(() => caller.query(api.directory.account, { userId })),
    effectiveAccess: await attempt(() =>
      caller.query(api.directory.effectiveAccess, { userId }),
    ),
    auditFeed: await attempt(() => caller.query(api.directory.auditFeed, {})),
  };
}

async function directoryWrites(caller: Caller, userId: Id<"users">, scope: Scope) {
  const attempt = async <T>(call: () => Promise<T>) => {
    try {
      return await call();
    } catch {
      return "refused" as const;
    }
  };
  return {
    setRole: await attempt(() =>
      caller.mutation(api.directory.setRole, { userId, role: "administrator" }),
    ),
    setActive: await attempt(() =>
      caller.mutation(api.directory.setActive, { userId, isActive: false }),
    ),
    linkPerson: await attempt(() =>
      caller.mutation(api.directory.linkPerson, { userId, personId: null }),
    ),
    grant: await attempt(() => caller.mutation(api.directory.grant, { userId, scope })),
    revoke: await attempt(() => caller.mutation(api.directory.revoke, { userId, scope })),
  };
}

type Scope =
  | { tier: "season"; seasonId: Id<"seasons"> }
  | { tier: "chainPlan"; chainPlanId: Id<"chainPlans"> }
  | { tier: "promotion"; promotionId: Id<"promotions"> };

/** The roster entry for one email, failing loudly rather than answering undefined. */
function entryFor(
  roster: FunctionReturnType<typeof api.directory.roster>,
  email: string,
) {
  const entry = roster.accounts.find((account) => account.email === email);
  if (entry === undefined) throw new Error(`${email} is not on the roster`);
  return entry;
}

/** The id the Directory addresses one account by. */
async function userIdOf(t: Awaited<ReturnType<typeof world>>["t"], email: string) {
  const roster = await t.withIdentity(ADMIN).query(api.directory.roster, {});
  return entryFor(roster, email).userId;
}

// --- The awaiting-access queue --------------------------------------------

test("a new sign-in lands in the awaiting-access queue and leaves it when granted", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);

  const before = await as.query(api.directory.roster, {});
  expect(entryFor(before, NEWCOMER.email)).toMatchObject({
    awaitingAccess: true,
    role: "member",
    isActive: true,
    grantCount: 0,
  });
  expect(before.awaitingCount).toBe(1);
  expect(await as.query(api.directory.awaitingCount, {})).toBe(1);

  const samId = entryFor(before, NEWCOMER.email).userId;
  await as.mutation(api.directory.grant, {
    userId: samId,
    scope: { tier: "promotion", promotionId: promotions["Spring Rosé"] },
  });

  const after = await as.query(api.directory.roster, {});
  expect(entryFor(after, NEWCOMER.email)).toMatchObject({
    awaitingAccess: false,
    grantCount: 1,
  });
  expect(after.awaitingCount).toBe(0);
});

test("granting from the Directory unlocks the Member's world", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const asSam = t.withIdentity(NEWCOMER);
  const promotionId = promotions["Spring Rosé"];

  // Before the grant, the promotion is not merely locked — it reads as gone.
  expect(await asSam.query(api.promotions.get, { promotionId, today: TODAY })).toBeNull();
  expect(await asSam.query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [],
  });

  await as.mutation(api.directory.grant, {
    userId: await userIdOf(t, NEWCOMER.email),
    scope: { tier: "promotion", promotionId },
  });

  const promotion = await asSam.query(api.promotions.get, { promotionId, today: TODAY });
  expect(promotion).not.toBeNull();
  expect(promotion?.promotion.name).toBe("Spring Rosé");
  expect(await asSam.query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [{ tier: "promotion", label: "Spring Rosé · Albertsons" }],
  });
});

// --- Person links ---------------------------------------------------------

/**
 * A Distributor contact and an internal colleague who share the account's
 * surname, so "internal only" is a choice the matcher makes rather than the
 * only row it had.
 */
async function withExternalPerson(t: Awaited<ReturnType<typeof world>>["t"]) {
  const distributorFunction = await t.run(
    async (ctx) =>
      await ctx.db.insert("functions", {
        key: "distributor",
        name: "Distributor",
        kind: "external",
        order: 5,
      }),
  );
  const as = t.withIdentity(ADMIN);
  const external = await as.mutation(api.people.create, {
    name: "Sam Vasquez",
    functionId: distributorFunction,
    email: NEWCOMER.email,
  });
  return { external, distributorFunction };
}

test("candidate matching offers internal People only, never Distributor or Buyer", async () => {
  const { t, functionId } = await world();
  const as = t.withIdentity(ADMIN);
  await withExternalPerson(t);
  const internal = await as.mutation(api.people.create, {
    name: "Sam Rivera",
    functionId,
    title: "Retail Marketing Manager",
  });

  const detail = await as.query(api.directory.account, {
    userId: await userIdOf(t, NEWCOMER.email),
  });

  // "Sam Vasquez" matches on the account's name *and* carries its exact email
  // address — the strongest possible match, and still never offered.
  expect(detail?.candidates).toEqual([
    {
      personId: internal,
      name: "Sam Rivera",
      title: "Retail Marketing Manager",
      functionName: "Retail Marketing",
      reason: "name",
    },
  ]);
});

test("an email match outranks a name match, and a Person is only offered once", async () => {
  const { t, functionId } = await world();
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.people.create, { name: "Sam Rivera", functionId });
  const byEmail = await as.mutation(api.people.create, {
    name: "Samantha Cole",
    functionId,
    email: NEWCOMER.email.toUpperCase(),
  });
  const samId = await userIdOf(t, NEWCOMER.email);

  const before = await as.query(api.directory.account, { userId: samId });
  expect(before?.candidates.map((candidate) => candidate.reason)).toEqual([
    "email",
    "name",
  ]);

  // Linked to somebody else, a Person stops being a candidate for anyone.
  await as.mutation(api.directory.linkPerson, {
    userId: await userIdOf(t, PROMO_MEMBER.email),
    personId: byEmail,
  });
  const after = await as.query(api.directory.account, { userId: samId });
  expect(after?.candidates.map((candidate) => candidate.name)).toEqual(["Sam Rivera"]);
});

test("linking and unlinking a Person both work and are audited", async () => {
  const { t, carol } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);

  expect(
    await as.mutation(api.directory.linkPerson, { userId: samId, personId: carol }),
  ).toBe(true);
  expect(await as.query(api.directory.account, { userId: samId })).toMatchObject({
    person: { personId: carol, name: "Carol Diaz" },
    candidates: [],
  });

  expect(
    await as.mutation(api.directory.linkPerson, { userId: samId, personId: null }),
  ).toBe(true);
  expect((await as.query(api.directory.account, { userId: samId }))?.person).toBeNull();

  const feed = await as.query(api.directory.auditFeed, { userId: samId });
  expect(feed.map((event) => [event.action, event.detail])).toEqual([
    ["person_linked", "unlinked"],
    ["person_linked", "linked to Carol Diaz"],
    ["user_created", "first sign-in"],
  ]);
});

test("a Person carrying a sign-in cannot be deleted out from under the account", async () => {
  const { t, functionId } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const sam = await as.mutation(api.people.create, { name: "Sam Rivera", functionId });

  await as.mutation(api.directory.linkPerson, { userId: samId, personId: sam });
  await expect(as.mutation(api.people.remove, { personId: sam })).rejects.toThrow(
    /linked to a sign-in account/,
  );

  // Unlinking is the recorded way to break the link, and it clears the way.
  await as.mutation(api.directory.linkPerson, { userId: samId, personId: null });
  await as.mutation(api.people.remove, { personId: sam });
  expect((await as.query(api.directory.account, { userId: samId }))?.person).toBeNull();
});

test("a link left pointing at nothing is repairable from the pane", async () => {
  const { t, functionId } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const gone = await as.mutation(api.people.create, { name: "Sam Rivera", functionId });
  await as.mutation(api.directory.linkPerson, { userId: samId, personId: gone });

  // `people.remove` refuses this, so the dangling link can only arrive from
  // outside the tool — a migration, a dashboard delete. The pane still has to
  // offer a way out of it rather than showing a link to nothing forever.
  await t.run(async (ctx) => await ctx.db.delete(gone));
  const replacement = await as.mutation(api.people.create, {
    name: "Sam Rivera",
    functionId,
    email: NEWCOMER.email,
  });

  const detail = await as.query(api.directory.account, { userId: samId });
  expect(detail?.person).toBeNull();
  expect(detail?.candidates.map((candidate) => candidate.personId)).toEqual([
    replacement,
  ]);

  await as.mutation(api.directory.linkPerson, { userId: samId, personId: replacement });
  expect((await as.query(api.directory.account, { userId: samId }))?.person).toMatchObject(
    { personId: replacement },
  );
});

test("an external Person cannot be linked even when named directly", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const { external } = await withExternalPerson(t);
  const samId = await userIdOf(t, NEWCOMER.email);

  await expect(
    as.mutation(api.directory.linkPerson, { userId: samId, personId: external }),
  ).rejects.toThrow(/internal People/);
  expect((await as.query(api.directory.account, { userId: samId }))?.person).toBeNull();
});

test("a Person already linked to another account is refused", async () => {
  const { t, carol } = await world();
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.directory.linkPerson, {
    userId: await userIdOf(t, PROMO_MEMBER.email),
    personId: carol,
  });

  await expect(
    as.mutation(api.directory.linkPerson, {
      userId: await userIdOf(t, NEWCOMER.email),
      personId: carol,
    }),
  ).rejects.toThrow(/already linked/);
});

// --- Grants: preview, union, revoke ---------------------------------------

/** The reach of every node of the hierarchy, flattened for one assertion. */
function reaches(
  years: FunctionReturnType<typeof api.directory.effectiveAccess>,
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const year of years) {
    flat[year.label] = year.reach;
    for (const plan of year.plans) {
      flat[plan.label] = plan.reach;
      for (const promotion of plan.promotions) flat[promotion.label] = promotion.reach;
    }
  }
  return flat;
}

test("the effective-access preview shows what a grant will unlock, before it is made", async () => {
  const { t, plans } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const scope = { tier: "chainPlan", chainPlanId: plans.Kroger } as const;

  const nothing = reaches(await as.query(api.directory.effectiveAccess, { userId: samId }));
  expect(new Set(Object.values(nothing))).toEqual(new Set(["none"]));

  const preview = reaches(
    await as.query(api.directory.effectiveAccess, { userId: samId, adding: scope }),
  );
  expect(preview).toEqual({
    "Plan Year 2026": "context",
    Albertsons: "none",
    "Gift Sets": "none",
    "Spring Rosé": "none",
    Kroger: "full",
    "Holiday Endcap": "full",
    Ralphs: "none",
  });

  // The preview was a promise: making the grant produces exactly that tree, and
  // the account itself now reads the plan it predicted.
  await as.mutation(api.directory.grant, { userId: samId, scope });
  expect(reaches(await as.query(api.directory.effectiveAccess, { userId: samId }))).toEqual(
    preview,
  );
  expect(
    await t
      .withIdentity(NEWCOMER)
      .query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
  ).not.toBeNull();
});

test("an Administrator's preview is the whole hierarchy, whatever they hold", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const tree = reaches(
    await as.query(api.directory.effectiveAccess, {
      userId: await userIdOf(t, ADMIN.email),
    }),
  );
  expect(new Set(Object.values(tree))).toEqual(new Set(["full"]));
});

test("overlapping grants are harmless: revoking the redundant one changes nothing", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const year = { tier: "season", seasonId } as const;
  const promotion = { tier: "promotion", promotionId: promotions["Gift Sets"] } as const;

  await as.mutation(api.directory.grant, { userId: samId, scope: year });
  await as.mutation(api.directory.grant, { userId: samId, scope: promotion });
  const whole = reaches(await as.query(api.directory.effectiveAccess, { userId: samId }));
  expect(new Set(Object.values(whole))).toEqual(new Set(["full"]));

  // The promotion grant is redundant under the year grant, so taking it back
  // takes nothing away.
  expect(
    await as.mutation(api.directory.revoke, { userId: samId, scope: promotion }),
  ).toBe(true);
  expect(reaches(await as.query(api.directory.effectiveAccess, { userId: samId }))).toEqual(
    whole,
  );
  expect(
    await t
      .withIdentity(NEWCOMER)
      .query(api.chainPlans.get, { chainPlanId: plans.Albertsons, today: TODAY }),
  ).not.toBeNull();

  // Revoking the year is what actually takes it away.
  await as.mutation(api.directory.revoke, { userId: samId, scope: year });
  expect(
    await t
      .withIdentity(NEWCOMER)
      .query(api.chainPlans.get, { chainPlanId: plans.Albertsons, today: TODAY }),
  ).toBeNull();
});

test("re-granting the same scope is a no-op and revoking a scope nobody held is not an error", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const scope = { tier: "promotion", promotionId: promotions["Gift Sets"] } as const;

  expect(await as.mutation(api.directory.grant, { userId: samId, scope })).toBe(true);
  expect(await as.mutation(api.directory.grant, { userId: samId, scope })).toBe(false);
  expect(
    (await as.query(api.directory.account, { userId: samId }))?.grants,
  ).toHaveLength(1);

  expect(await as.mutation(api.directory.revoke, { userId: samId, scope })).toBe(true);
  expect(await as.mutation(api.directory.revoke, { userId: samId, scope })).toBe(false);
});

test("granting an Administrator an assignment is refused as dead weight", async () => {
  const { t, seasonId } = await world();
  const as = t.withIdentity(ADMIN);
  await expect(
    as.mutation(api.directory.grant, {
      userId: await userIdOf(t, ADMIN.email),
      scope: { tier: "season", seasonId },
    }),
  ).rejects.toThrow(/already reach everything/);
});

test("a grant carries who made it, and the CLI's grants say so", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  await as.mutation(api.directory.grant, {
    userId: samId,
    scope: { tier: "promotion", promotionId: promotions["Gift Sets"] },
  });

  expect((await as.query(api.directory.account, { userId: samId }))?.grants).toMatchObject(
    [{ label: "Gift Sets · Albertsons", grantedByName: ADMIN.name }],
  );
  // The fixture's grants were made with deploy credentials: no account to name.
  expect(
    (await as.query(api.directory.account, { userId: await userIdOf(t, PLAN_MEMBER.email) }))
      ?.grants,
  ).toMatchObject([{ label: "Kroger plan · 2026", grantedByName: null }]);
});

// --- Account lifecycle ----------------------------------------------------

test("deactivation denies the account's next call and reactivation restores it exactly", async () => {
  const { t, plans } = await world();
  const as = t.withIdentity(ADMIN);
  const asMarcus = t.withIdentity(PLAN_MEMBER);
  const marcusId = await userIdOf(t, PLAN_MEMBER.email);

  const before = await asMarcus.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  });
  expect(before).not.toBeNull();

  await as.mutation(api.directory.setActive, { userId: marcusId, isActive: false });

  // The very next call, with no new token and nothing expired.
  await expect(
    asMarcus.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
  ).rejects.toThrow();
  expect(await asMarcus.query(api.access.me, {})).toMatchObject({
    state: "deactivated",
    account: { email: PLAN_MEMBER.email },
  });
  // Signing in again is not reactivation.
  await asMarcus.mutation(api.access.ensureUser, {});
  expect(await asMarcus.query(api.access.me, {})).toMatchObject({ state: "deactivated" });

  await as.mutation(api.directory.setActive, { userId: marcusId, isActive: true });
  expect(
    await asMarcus.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
  ).toEqual(before);
  expect(await asMarcus.query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [{ tier: "chainPlan", label: "Kroger plan · 2026" }],
  });
});

test("a deactivated Administrator comes back an Administrator", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const second = token("user_second", "erin@vctusa.com");
  await t.withIdentity(second).mutation(api.access.ensureUser, {});
  const erinId = await userIdOf(t, second.email);
  await as.mutation(api.directory.setRole, { userId: erinId, role: "administrator" });

  await as.mutation(api.directory.setActive, { userId: erinId, isActive: false });
  await as.mutation(api.directory.setActive, { userId: erinId, isActive: true });

  expect(await t.withIdentity(second).query(api.directory.myAccess, {})).toMatchObject({
    role: "administrator",
  });
});

test("a promoted Member keeps their grants and gets them back on demotion", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const priyaId = await userIdOf(t, PROMO_MEMBER.email);

  await as.mutation(api.directory.setRole, { userId: priyaId, role: "administrator" });
  expect(await t.withIdentity(PROMO_MEMBER).query(api.directory.myAccess, {})).toEqual({
    role: "administrator",
    scopes: [{ tier: "promotion", label: "Gift Sets · Albertsons" }],
  });

  await as.mutation(api.directory.setRole, { userId: priyaId, role: "member" });
  expect(await t.withIdentity(PROMO_MEMBER).query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [{ tier: "promotion", label: "Gift Sets · Albertsons" }],
  });
});

// --- The last active Administrator ----------------------------------------

test("the last active Administrator cannot be demoted or deactivated", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const danaId = await userIdOf(t, ADMIN.email);

  expect(await as.query(api.directory.account, { userId: danaId })).toMatchObject({
    isLastActiveAdministrator: true,
  });
  expect((await as.query(api.directory.roster, {})).activeAdministrators).toBe(1);

  await expect(
    as.mutation(api.directory.setRole, { userId: danaId, role: "member" }),
  ).rejects.toThrow(/last active Administrator/);
  await expect(
    as.mutation(api.directory.setActive, { userId: danaId, isActive: false }),
  ).rejects.toThrow(/last active Administrator/);

  // And the refusal was real, not cosmetic.
  expect(await as.query(api.directory.myAccess, {})).toMatchObject({
    role: "administrator",
  });
});

test("a second Administrator releases the guard, and taking them away restores it", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const danaId = await userIdOf(t, ADMIN.email);
  const yolandaId = await userIdOf(t, YEAR_MEMBER.email);

  await as.mutation(api.directory.setRole, { userId: yolandaId, role: "administrator" });
  expect(await as.mutation(api.directory.setActive, { userId: danaId, isActive: false })).toBe(
    true,
  );

  // Dana is gone, so Yolanda is now the one who cannot be removed.
  const asYolanda = t.withIdentity(YEAR_MEMBER);
  await expect(
    asYolanda.mutation(api.directory.setRole, { userId: yolandaId, role: "member" }),
  ).rejects.toThrow(/last active Administrator/);
  expect(await asYolanda.query(api.directory.account, { userId: yolandaId })).toMatchObject({
    isLastActiveAdministrator: true,
  });
});

test("no legal sequence of Directory moves empties the deployment of Administrators", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const danaId = await userIdOf(t, ADMIN.email);
  const yolandaId = await userIdOf(t, YEAR_MEMBER.email);
  const asYolanda = t.withIdentity(YEAR_MEMBER);

  // The closest anyone gets to turning the lights out from inside: promote a
  // second Administrator, have them deactivate the first, then have them try to
  // hand the role back. The last move is the one the guard exists for.
  await as.mutation(api.directory.setRole, { userId: yolandaId, role: "administrator" });
  await asYolanda.mutation(api.directory.setActive, { userId: danaId, isActive: false });
  await expect(
    asYolanda.mutation(api.directory.setRole, { userId: yolandaId, role: "member" }),
  ).rejects.toThrow(/last active Administrator/);
  expect((await asYolanda.query(api.directory.roster, {})).activeAdministrators).toBe(1);

  // Break-glass is for the lockout the guard cannot prevent — an Administrator
  // losing their identity-provider account — and it reaches an account the Directory
  // deactivated, with the role that account already had.
  // (bootstrap.test.ts covers the deployment with no Administrator at all.)
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  expect(await as.query(api.directory.myAccess, {})).toMatchObject({
    role: "administrator",
  });
});

// --- The audit feed -------------------------------------------------------

test("every access-management action lands in the feed with an actor and a timestamp", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const scope = { tier: "promotion", promotionId: promotions["Gift Sets"] } as const;

  await as.mutation(api.directory.grant, { userId: samId, scope });
  await as.mutation(api.directory.revoke, { userId: samId, scope });
  await as.mutation(api.directory.setRole, { userId: samId, role: "administrator" });
  await as.mutation(api.directory.setRole, { userId: samId, role: "member" });
  await as.mutation(api.directory.setActive, { userId: samId, isActive: false });
  await as.mutation(api.directory.setActive, { userId: samId, isActive: true });

  const feed = await as.query(api.directory.auditFeed, { userId: samId });
  expect(feed.map((event) => event.action)).toEqual([
    "user_activated",
    "user_deactivated",
    "role_changed",
    "role_changed",
    "access_revoked",
    "access_granted",
    "user_created",
  ]);
  for (const event of feed.slice(0, 6)) {
    expect(event.actorName).toBe(ADMIN.name);
    expect(event.subjectName).toBe(NEWCOMER.name);
    expect(event.at).toBeGreaterThan(0);
  }
});

test("the feed names the operator behind a deploy-credential action", async () => {
  const { t } = await world();
  const feed = await t.withIdentity(ADMIN).query(api.directory.auditFeed, {});
  const bootstrap = feed.filter((event) => event.actorName === null);

  expect(bootstrap.map((event) => event.action)).toEqual(
    expect.arrayContaining(["role_changed", "access_granted"]),
  );
  expect(bootstrap.every((event) => event.detail?.includes("deploy credentials"))).toBe(
    true,
  );
});

test("the whole-company feed is newest first and covers every account", async () => {
  const { t, seasonId } = await world();
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.directory.grant, {
    userId: await userIdOf(t, NEWCOMER.email),
    scope: { tier: "season", seasonId },
  });

  const feed = await as.query(api.directory.auditFeed, {});
  expect(feed[0]).toMatchObject({ action: "access_granted", subjectName: NEWCOMER.name });
  expect([...feed].sort((a, b) => b.at - a.at)).toEqual(feed);
  expect(new Set(feed.map((event) => event.subjectName)).size).toBeGreaterThan(1);
});

// --- Who may call any of this ---------------------------------------------

test("a Member is refused every Directory function", async () => {
  const { t, promotions } = await world();
  const scope = { tier: "promotion", promotionId: promotions["Gift Sets"] } as const;
  const danaId = await userIdOf(t, ADMIN.email);
  const refused = {
    roster: "refused",
    awaitingCount: "refused",
    account: "refused",
    effectiveAccess: "refused",
    auditFeed: "refused",
  };

  for (const who of [YEAR_MEMBER, PLAN_MEMBER, PROMO_MEMBER, NEWCOMER]) {
    const caller = t.withIdentity(who);
    expect(await directoryReads(caller, danaId)).toEqual(refused);
    expect(await directoryWrites(caller, danaId, scope)).toEqual({
      setRole: "refused",
      setActive: "refused",
      linkPerson: "refused",
      grant: "refused",
      revoke: "refused",
    });
  }
});

test("an anonymous caller is refused every Directory function", async () => {
  const { t, promotions } = await world();
  const danaId = await userIdOf(t, ADMIN.email);
  const results = await directoryReads(t, danaId);
  expect(results).toEqual({
    roster: "refused",
    awaitingCount: "refused",
    account: "refused",
    effectiveAccess: "refused",
    auditFeed: "refused",
  });
  expect(
    await directoryWrites(t, danaId, {
      tier: "promotion",
      promotionId: promotions["Gift Sets"],
    }),
  ).toEqual({
    setRole: "refused",
    setActive: "refused",
    linkPerson: "refused",
    grant: "refused",
    revoke: "refused",
  });
});

test("a Member's own role and scopes are all they can read about access", async () => {
  const { t } = await world();
  expect(await t.withIdentity(YEAR_MEMBER).query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [{ tier: "season", label: "Plan Year 2026" }],
  });
  // Nothing about anybody else rides along.
  const mine = await t.withIdentity(PROMO_MEMBER).query(api.directory.myAccess, {});
  expect(JSON.stringify(mine)).not.toContain("dana");
  expect(JSON.stringify(mine)).not.toContain("Kroger");
});

test("a deactivated Administrator loses the Directory with everything else", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const yolandaId = await userIdOf(t, YEAR_MEMBER.email);
  await as.mutation(api.directory.setRole, { userId: yolandaId, role: "administrator" });
  await as.mutation(api.directory.setActive, {
    userId: await userIdOf(t, ADMIN.email),
    isActive: false,
  });

  expect(await directoryReads(as, yolandaId)).toEqual({
    roster: "refused",
    awaitingCount: "refused",
    account: "refused",
    effectiveAccess: "refused",
    auditFeed: "refused",
  });
});

// --- Probing --------------------------------------------------------------

test("a forged account id reads exactly as a deleted one does", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);

  const forged = await as.query(api.directory.account, { userId: "not-an-id" });
  const wrongTable = await as.query(api.directory.account, {
    userId: (await userIdOf(t, ADMIN.email)).replace(/./, "z"),
  });
  await t.run(async (ctx) => await ctx.db.delete(samId));
  const deleted = await as.query(api.directory.account, { userId: samId });

  expect(bytes(forged)).toBe(bytes(deleted));
  expect(bytes(wrongTable)).toBe(bytes(deleted));
  expect(deleted).toBeNull();

  expect(bytes(await as.query(api.directory.auditFeed, { userId: "not-an-id" }))).toBe(
    bytes(await as.query(api.directory.auditFeed, { userId: samId })),
  );
});

test("a grant aimed at a forged scope fails exactly as one aimed at a deleted scope", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  const doomed = promotions["Spring Rosé"];

  const message = async (call: () => Promise<unknown>) => {
    try {
      await call();
      return "no refusal";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  // A well-formed id for a Promotion that was never created. (A *malformed*
  // one never reaches the handler at all: `v.id` rejects it during argument
  // validation, the same way it does everywhere else in the app.)
  const forged = await message(() =>
    as.mutation(api.directory.grant, {
      userId: samId,
      scope: {
        tier: "promotion",
        promotionId: doomed.replace(/^.{4}/, "9999") as typeof doomed,
      },
    }),
  );
  await as.mutation(api.promotions.remove, { promotionId: doomed });
  const deleted = await message(() =>
    as.mutation(api.directory.grant, {
      userId: samId,
      scope: { tier: "promotion", promotionId: doomed },
    }),
  );

  expect(forged).toBe(deleted);
  expect(deleted).toContain("no longer exists");
});

test("a grant to a deleted account fails as a missing account, not as a new one", async () => {
  const { t, seasonId } = await world();
  const as = t.withIdentity(ADMIN);
  const samId = await userIdOf(t, NEWCOMER.email);
  await t.run(async (ctx) => await ctx.db.delete(samId));

  await expect(
    as.mutation(api.directory.grant, {
      userId: samId,
      scope: { tier: "season", seasonId },
    }),
  ).rejects.toThrow(/no longer exists/);
  expect((await as.query(api.directory.roster, {})).accounts).toHaveLength(4);
});

// --- A grant that outlives its target -------------------------------------

test("a grant whose target is deleted stops counting as access", async () => {
  const { t, promotions } = await world();
  const as = t.withIdentity(ADMIN);
  const priyaId = await userIdOf(t, PROMO_MEMBER.email);
  expect(entryFor(await as.query(api.directory.roster, {}), PROMO_MEMBER.email)).toMatchObject(
    { grantCount: 1, awaitingAccess: false },
  );

  await as.mutation(api.promotions.remove, { promotionId: promotions["Gift Sets"] });

  const entry = entryFor(await as.query(api.directory.roster, {}), PROMO_MEMBER.email);
  expect(entry).toMatchObject({ grantCount: 0, awaitingAccess: true });
  expect((await as.query(api.directory.account, { userId: priyaId }))?.grants).toEqual([]);
  expect(await t.withIdentity(PROMO_MEMBER).query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [],
  });
});

// --- The roster's own shape -----------------------------------------------

test("the roster leads with the awaiting-access queue and ends with the offboarded", async () => {
  const { t } = await world();
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.directory.setActive, {
    userId: await userIdOf(t, PLAN_MEMBER.email),
    isActive: false,
  });

  const roster = await as.query(api.directory.roster, {});
  expect(roster.accounts.map((account) => account.email)).toEqual([
    NEWCOMER.email,
    ADMIN.email,
    PROMO_MEMBER.email,
    YEAR_MEMBER.email,
    PLAN_MEMBER.email,
  ]);
  expect(roster.accounts.at(-1)).toMatchObject({ isActive: false, grantCount: 1 });
});

test("an account with no name claims still has a row and a Person link", async () => {
  const { t, carol } = await world();
  const ghost = { subject: "user_ghost", issuer: token("x", "y").issuer };
  await t.withIdentity(ghost).mutation(api.access.ensureUser, {});
  const as = t.withIdentity(ADMIN);

  const entry = (await as.query(api.directory.roster, {})).accounts.find(
    (account) => account.email === undefined,
  );
  expect(entry).toMatchObject({ name: "Unnamed account", awaitingAccess: true });

  await as.mutation(api.directory.linkPerson, {
    userId: entry?.userId as Id<"users">,
    personId: carol,
  });
  expect(
    (await as.query(api.directory.account, { userId: entry?.userId as Id<"users"> }))?.person,
  ).toMatchObject({ name: "Carol Diaz" });
});
