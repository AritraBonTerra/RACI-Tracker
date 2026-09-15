import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  ADMIN,
  bytes,
  type Caller,
  NEWCOMER,
  PLAN_MEMBER,
  PROMO_MEMBER,
  TODAY,
  world,
  YEAR_MEMBER,
} from "./world.fixture";

// The Administrator's lens (CONTEXT.md: View as). The claim under test is
// exact: with the lens on, every call the Administrator makes is answered
// byte-for-byte as the Editor or Viewer would be answered — not a preview, the
// same code path — and nothing can be written through it.

/** The Directory's id for an account, the way the "View as" button learns it. */
async function accountId(as: Caller, email: string): Promise<Id<"users">> {
  const roster = await as.query(api.directory.roster, {});
  const entry = roster.accounts.find((account) => account.email === email);
  if (entry === undefined) throw new Error(`No account for ${email}`);
  return entry.userId;
}

test("through the lens, an Administrator is answered exactly as the Editor is", async () => {
  const { t, seasonId, plans, promotions } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  const asMarcus = t.withIdentity(PLAN_MEMBER);
  const dana = await accountId(asAdmin, ADMIN.email);

  await asAdmin.mutation(api.access.viewAs, {
    userId: await accountId(asAdmin, PLAN_MEMBER.email),
  });

  // The shell is told whose world it is rendering, and whose eyes these are.
  const me = await asAdmin.query(api.access.me, {});
  expect(me).toMatchObject({
    state: "active",
    account: { role: "member", email: PLAN_MEMBER.email, displayName: "Marcus Bell" },
    viewingAs: { name: "Marcus Bell", role: "member" },
  });
  if (me.state !== "active") throw new Error("unreachable");
  // The identity behind the token is still the Administrator's.
  expect(me.callerId).toBe(dana);
  expect(bytes(me.scopes)).toBe(bytes((await asMarcus.query(api.access.me, {})).scopes));

  // The tree, the plan Marcus holds, the promotion he does not, and the
  // dashboard: identical answers to the ones Marcus gets himself.
  const probes = [
    () => asAdmin.query(api.seasons.tree, { seasonId, today: TODAY }),
    () => asAdmin.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
    () => asAdmin.query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: TODAY }),
    () => asAdmin.query(api.home.dashboard, { seasonId, today: TODAY }),
  ] as const;
  const own = [
    () => asMarcus.query(api.seasons.tree, { seasonId, today: TODAY }),
    () => asMarcus.query(api.chainPlans.get, { chainPlanId: plans.Kroger, today: TODAY }),
    () =>
      asMarcus.query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: TODAY }),
    () => asMarcus.query(api.home.dashboard, { seasonId, today: TODAY }),
  ] as const;
  for (const [index, probe] of probes.entries()) {
    expect(bytes(await probe())).toBe(bytes(await own[index]()));
  }
  // And the sibling promotion really is gone through the lens.
  expect(
    await asAdmin.query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: TODAY }),
  ).toBeNull();

  // The Administrator's own surfaces close with the lens.
  await expect(asAdmin.query(api.directory.roster, {})).rejects.toThrow(/don't have access/);
  await expect(asAdmin.query(api.directory.awaitingCount, {})).rejects.toThrow(/don't have access/);
  // A Member's own "what do I have?" answers for the account being viewed as.
  expect(await asAdmin.query(api.directory.myAccess, {})).toMatchObject({ role: "member" });

  // Putting the lens down restores everything, and the Directory answers again.
  await asAdmin.mutation(api.access.stopViewingAs, {});
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({
    account: { role: "administrator" },
    viewingAs: null,
  });
  expect(
    await asAdmin.query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: TODAY }),
  ).not.toBeNull();
  await expect(asAdmin.query(api.directory.roster, {})).resolves.toBeDefined();
});

test("the lens is read-only: every write is refused and says why", async () => {
  const { t, plans, promotions } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  await asAdmin.mutation(api.access.viewAs, {
    userId: await accountId(asAdmin, PLAN_MEMBER.email),
  });

  const before = await asAdmin.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  });
  if (before === null) throw new Error("Marcus holds the Kroger plan");

  // A write Marcus could make, inside his own scope, is refused with a reason
  // — the caller is a verified Administrator, so the refusal may explain.
  await expect(
    asAdmin.mutation(api.tasks.create, {
      owner: { tier: "chainPlan", chainPlanId: plans.Kroger },
      phase: 2,
      name: "Written through the lens",
    }),
  ).rejects.toThrow(/viewing as Marcus Bell/);
  await expect(
    asAdmin.mutation(api.chainPlans.update, { chainPlanId: plans.Kroger, notes: "changed" }),
  ).rejects.toThrow(/Stop viewing as them/);
  // The Administrator's own writes are closed too, not only the scoped ones.
  await expect(
    asAdmin.mutation(api.promotions.remove, { promotionId: promotions["Holiday Endcap"] }),
  ).rejects.toThrow();

  // Nothing landed.
  await asAdmin.mutation(api.access.stopViewingAs, {});
  const after = await asAdmin.query(api.chainPlans.get, {
    chainPlanId: plans.Kroger,
    today: TODAY,
  });
  expect(after?.tasks.length).toBe(before.tasks.length);
  expect(after?.plan.notes).toBe(before.plan.notes);
});

test("a Viewer's lens reads as a Viewer, and one account swaps for another in one call", async () => {
  const { t, promotions } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  const priya = await accountId(asAdmin, PROMO_MEMBER.email);
  const marcus = await accountId(asAdmin, PLAN_MEMBER.email);
  await asAdmin.mutation(api.directory.setRole, { userId: priya, role: "viewer" });

  await asAdmin.mutation(api.access.viewAs, { userId: marcus });
  // Moving the lens answers to the Administrator, not through the lens.
  await asAdmin.mutation(api.access.viewAs, { userId: priya });

  expect(await asAdmin.query(api.access.me, {})).toMatchObject({
    account: { role: "viewer" },
    viewingAs: { name: "Priya Raman", role: "viewer" },
    // A single-Promotion account lands on its promotion, and so does the lens.
    landing: { kind: "promotion", promotionId: promotions["Gift Sets"] },
  });
});

test("an account with nothing granted is seen waiting, as they see it", async () => {
  const { t } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  await asAdmin.mutation(api.access.viewAs, { userId: await accountId(asAdmin, NEWCOMER.email) });

  expect(await asAdmin.query(api.access.me, {})).toMatchObject({
    account: { role: "member", email: NEWCOMER.email },
    scopes: [],
    viewingAs: { name: "Sam Nakamura", role: "member" },
  });
  // The way out still works from the waiting screen.
  await asAdmin.mutation(api.access.stopViewingAs, {});
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({ viewingAs: null });
});

test("only an Administrator holds a lens, and only on an account with a view to borrow", async () => {
  const { t } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  const marcus = await accountId(asAdmin, PLAN_MEMBER.email);
  const priya = await accountId(asAdmin, PROMO_MEMBER.email);
  const dana = await accountId(asAdmin, ADMIN.email);

  // An Editor gets the opaque refusal, whoever they name.
  await expect(
    t.withIdentity(PLAN_MEMBER).mutation(api.access.viewAs, { userId: priya }),
  ).rejects.toThrow(/don't have access/);
  await expect(t.mutation(api.access.viewAs, { userId: priya })).rejects.toThrow();

  // Yourself, another Administrator, and an account that cannot sign in.
  await expect(asAdmin.mutation(api.access.viewAs, { userId: dana })).rejects.toThrow(/That's you/);
  await asAdmin.mutation(api.directory.setRole, { userId: marcus, role: "administrator" });
  await expect(asAdmin.mutation(api.access.viewAs, { userId: marcus })).rejects.toThrow(
    /already sees everything/,
  );
  await asAdmin.mutation(api.directory.setActive, { userId: priya, isActive: false });
  await expect(asAdmin.mutation(api.access.viewAs, { userId: priya })).rejects.toThrow(
    /can't sign in/,
  );

  // The Directory offers the button on exactly the accounts the server takes.
  const roster = await asAdmin.query(api.directory.roster, {});
  const offered = roster.accounts.filter((account) => account.viewableAs).map((a) => a.email);
  expect(offered.sort()).toEqual([NEWCOMER.email, YEAR_MEMBER.email].sort());
});

test("a lens on an account that stops qualifying is dropped, and so is a demoted holder's", async () => {
  const { t } = await world();
  const asAdmin = t.withIdentity(ADMIN);
  const marcus = await accountId(asAdmin, PLAN_MEMBER.email);
  // A second Administrator, to act while the first is behind the lens.
  await t.mutation(internal.bootstrap.grantAdmin, { email: YEAR_MEMBER.email });
  const asYolanda = t.withIdentity(YEAR_MEMBER);

  await asAdmin.mutation(api.access.viewAs, { userId: marcus });
  await asYolanda.mutation(api.directory.setActive, { userId: marcus, isActive: false });
  // A deactivated account has no view: the Administrator is themselves again,
  // with the Directory back, without having to do anything.
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({
    account: { role: "administrator" },
    viewingAs: null,
  });
  await expect(asAdmin.query(api.directory.roster, {})).resolves.toBeDefined();

  // Reactivating Marcus does not quietly put the lens back on: it was dropped,
  // not merely ignored, and a lens is only ever turned on by hand.
  await asYolanda.mutation(api.directory.setActive, { userId: marcus, isActive: true });
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({ viewingAs: null });

  // The same when the account is promoted underneath the lens and demoted back.
  await asAdmin.mutation(api.access.viewAs, { userId: marcus });
  await asYolanda.mutation(api.directory.setRole, { userId: marcus, role: "administrator" });
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({ viewingAs: null });
  await asYolanda.mutation(api.directory.setRole, { userId: marcus, role: "member" });
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({ viewingAs: null });

  // A lens is an Administrator's instrument: demotion drops it.
  await asAdmin.mutation(api.access.viewAs, { userId: marcus });
  const dana = await accountId(asYolanda, ADMIN.email);
  await asYolanda.mutation(api.directory.setRole, { userId: dana, role: "member" });
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({
    account: { role: "member", email: ADMIN.email },
    viewingAs: null,
  });
  // Promoted back, the lens does not silently return.
  await asYolanda.mutation(api.directory.setRole, { userId: dana, role: "administrator" });
  expect(await asAdmin.query(api.access.me, {})).toMatchObject({ viewingAs: null });
});
