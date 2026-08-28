import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ADMIN, NEWCOMER, PROMO_MEMBER, modules, token, world } from "./world.fixture";

// The cutover's own scenarios (#35): the parts of the #27 acceptance list that
// are about the *release* rather than the authorization matrix — the seeded data
// set the deployment starts from, the drills the runbook makes an operator walk,
// and the two properties that make redeploying the prior commit a safe rollback.
//
// Same seam as every other test here: public functions with an identity
// injected, internal functions invoked the way `bunx convex run` invokes them.
// Where a step of the runbook is a shell command, the test is that command's
// function call, run in the order the runbook writes it.

/** A deployment with nothing in it, as a fresh `convex deploy` leaves one. */
const freshDeployment = () => convexTest(schema, modules);

// --- The data set a deployment starts from (#27, scenario 30) --------------

test("the seed still produces the canonical data set", async () => {
  const t = freshDeployment();

  const summary = await t.mutation(internal.seed.run, {});

  // Frozen on purpose: `seed:run --prod` is a cutover step, and "the canonical
  // data set" has to mean one specific set of records rather than whatever the
  // seed happens to insert today.
  expect(summary).toEqual({
    today: "2026-08-20",
    deletedBeforeSeed: 0,
    taskTemplates: 34,
    seasons: 1,
    chains: 4,
    brands: 4,
    functions: 6,
    people: 12,
    chainPlans: 4,
    promotions: 4,
    phaseRaciDefaults: 54,
    tasks: 54,
    kpiEntries: 5,
    retros: 1,
  });
});

test("the seed is idempotent, so a second run lands on the same deployment", async () => {
  const t = freshDeployment();

  const first = await t.mutation(internal.seed.run, {});
  const second = await t.mutation(internal.seed.run, {});

  // Everything the first run inserted is cleared by the second, and what is
  // left is the same set of records — the property that makes reseeding a
  // recoverable step rather than a doubling one.
  expect(second.deletedBeforeSeed).toBeGreaterThan(0);
  expect({ ...second, deletedBeforeSeed: 0 }).toEqual({ ...first, deletedBeforeSeed: 0 });
});

test("Unassigned, Blocked and Overdue still mean what the demo data says they mean", async () => {
  // The derived states, read the way the dashboard reads them, on the seeded
  // year at the seed's own "today". These three counts are the tool's headline;
  // a change in them is a change in the product, not in a test.
  const t = freshDeployment();
  const { today } = await t.mutation(internal.seed.run, {});
  await t.withIdentity(ADMIN).mutation(api.access.ensureUser, {});
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  const as = t.withIdentity(ADMIN);

  const [year] = await as.query(api.seasons.list, {});
  const dashboard = await as.query(api.home.dashboard, { seasonId: year._id, today });

  expect(year.year).toBe(2026);
  expect(dashboard?.rollup).toEqual({
    total: 54,
    delivered: 20,
    inProgress: 12,
    notStarted: 20,
    unassigned: 12,
    missingAccountable: 4,
    blocked: 2,
    overdue: 13,
  });
  // The rail is the same rows the counts are, not a second computation.
  expect(dashboard?.attention.unassigned).toHaveLength(12);
  expect(dashboard?.attention.blocked).toHaveLength(2);
  expect(dashboard?.attention.overdue).toHaveLength(13);
  // Blocked screams: every blocked task says why.
  for (const { task } of dashboard?.attention.blocked ?? []) {
    expect(task.blockedReason).toBeTruthy();
  }
});

test("reseeding leaves the accounts alone and takes their grants with the records", async () => {
  // Worth knowing before anyone types `seed:run --prod` after cutover: the seed
  // owns the plan data and nothing else. Accounts, roles and the audit trail
  // survive it; a grant does not, because the record it named is gone — and
  // neither does a Person link, because People are plan data too.
  const { t, promotions, carol } = await world();
  const as = t.withIdentity(ADMIN);

  const { accounts } = await as.query(api.directory.roster, {});
  const priyaId = accounts.find((entry) => entry.email === PROMO_MEMBER.email)!.userId;
  await as.mutation(api.directory.linkPerson, { userId: priyaId, personId: carol });

  await t.mutation(internal.seed.run, {});

  // The link is the quietest casualty: the account comes back unlinked, with
  // nothing on screen to say it was ever linked, so the runbook names it.
  expect(await as.query(api.directory.account, { userId: priyaId })).toMatchObject({
    person: null,
  });

  expect(await t.withIdentity(PROMO_MEMBER).query(api.access.me, {})).toMatchObject({
    state: "active",
  });
  const priya = await t.withIdentity(PROMO_MEMBER).query(api.directory.myAccess, {});
  expect(priya.scopes).toEqual([]);
  expect(
    await t
      .withIdentity(PROMO_MEMBER)
      .query(api.promotions.get, { promotionId: promotions["Gift Sets"], today: "2026-08-20" }),
  ).toBeNull();
  // And the Administrator is still an Administrator, so the deployment is not
  // one reseed away from needing break-glass.
  expect(await t.withIdentity(ADMIN).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "administrator" },
  });
});

// --- Rolling back, and rolling forward again (#27, scenario 27) ------------

test("records written by the previous deployment still read and still write", async () => {
  // Rollback is redeploying the prior commit, which means the two commits have
  // to agree about the data. The prior commit writes rows with no last-edited
  // stamp on them; this one has to read those rows, show them, and edit them
  // without tripping over the absence.
  const t = freshDeployment();
  await t.mutation(internal.seed.run, {});
  await t.withIdentity(ADMIN).mutation(api.access.ensureUser, {});
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  const as = t.withIdentity(ADMIN);

  const [year] = await as.query(api.seasons.list, {});
  const overview = await as.query(api.seasons.overview, {
    seasonId: year._id,
    today: "2026-08-20",
  });

  // Seeded rows carry no stamp — nobody edited them — and the page renders them
  // anyway rather than insisting on one.
  expect(overview?.tasks).toHaveLength(5);
  expect(overview?.season.lastModifiedBy).toBeUndefined();
  expect(overview?.editors).toEqual({});

  // And an edit on top of an unstamped row stamps it, rather than assuming a
  // stamp was already there.
  await as.mutation(api.seasons.update, { seasonId: year._id, notes: "Rolled forward" });
  const edited = await as.query(api.seasons.overview, {
    seasonId: year._id,
    today: "2026-08-20",
  });
  expect(edited?.season.notes).toBe("Rolled forward");
  expect(edited?.editors[edited.season.lastModifiedBy!]).toBe(ADMIN.email);
});

test("the access tables are additive: the plan data never points at them", async () => {
  // The other half of the rollback claim. The prior commit knows nothing about
  // users, accessAssignments or auditEvents, so it can only run unmodified if
  // no record it *does* know about requires them. Every access column added to
  // an existing table is optional, which is what this asserts, from the outside:
  // rows inserted without one validate and read.
  const t = freshDeployment();

  const seasonId = await t.run(
    async (ctx) =>
      await ctx.db.insert("seasons", { year: 2027, label: "2027" }),
  );
  const chainId = await t.run(
    async (ctx) => await ctx.db.insert("chains", { name: "Safeway" }),
  );
  const chainPlanId = await t.run(
    async (ctx) => await ctx.db.insert("chainPlans", { seasonId, chainId, currentPhase: 1 }),
  );
  const promotionId = await t.run(
    async (ctx) =>
      await ctx.db.insert("promotions", {
        chainPlanId,
        seasonId,
        chainId,
        name: "Pre-auth promotion",
        brandIds: [],
        startDate: "2027-11-01",
        endDate: "2027-12-24",
        currentPhase: 5,
      }),
  );
  await t.run(
    async (ctx) =>
      await ctx.db.insert("tasks", {
        promotionId,
        chainPlanId,
        seasonId,
        phase: 5,
        name: "Written before sign-in existed",
        status: "not_started",
        order: 0,
        responsiblePersonIds: [],
        consultedPersonIds: [],
        informedPersonIds: [],
      }),
  );

  await t.withIdentity(ADMIN).mutation(api.access.ensureUser, {});
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  const page = await t
    .withIdentity(ADMIN)
    .query(api.promotions.get, { promotionId, today: "2027-11-15" });

  expect(page?.promotion.name).toBe("Pre-auth promotion");
  expect(page?.tasks.map((task) => task.name)).toEqual([
    "Written before sign-in existed",
  ]);
});

// --- The bootstrap drill (#27, scenario 23) --------------------------------

test("the bootstrap drill: sign in, grantAdmin, promote the second Administrator", async () => {
  // The runbook's step 4, executed in order against a deployment that has never
  // had an Administrator. Each assertion is what the operator sees on screen at
  // that step.
  const t = freshDeployment();
  await t.mutation(internal.seed.run, {});

  // 1. Aritra signs in. One account, Member, holding nothing.
  await t.withIdentity(ADMIN).mutation(api.access.ensureUser, {});
  expect(await t.withIdentity(ADMIN).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "member" },
  });
  expect(await t.withIdentity(ADMIN).query(api.directory.myAccess, {})).toEqual({
    role: "member",
    scopes: [],
  });
  // Nothing to run access from yet: the Directory refuses him like anyone else.
  await expect(t.withIdentity(ADMIN).query(api.directory.roster, {})).rejects.toThrow();

  // 2. `bunx convex run bootstrap:grantAdmin --prod`.
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  expect(await t.withIdentity(ADMIN).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "administrator" },
  });

  // 3. The second Administrator signs in and is promoted from the Directory,
  //    not from the CLI — the two-Administrator policy, established by hand
  //    once and never needing deploy credentials again.
  const second = token("user_emmanuel", "emmanuel@vctusa.com");
  await t.withIdentity(second).mutation(api.access.ensureUser, {});
  const roster = await t.withIdentity(ADMIN).query(api.directory.roster, {});
  const account = roster.accounts.find((row) => row.email === second.email);
  expect(account).toMatchObject({ role: "member", awaitingAccess: true });
  expect(roster.awaitingCount).toBe(1);
  await t.withIdentity(ADMIN).mutation(api.directory.setRole, {
    userId: account!.userId,
    role: "administrator",
  });

  expect(await t.withIdentity(second).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "administrator" },
  });

  // 4. Both promotions are in the feed, and the first one names the credentials
  //    it was made with rather than leaving a hole where the first
  //    Administrator came from.
  const feed = await t.withIdentity(ADMIN).query(api.directory.auditFeed, {});
  const promotions = feed
    .filter((event) => event.action === "role_changed")
    .map((event) => ({ subject: event.subjectName, actor: event.actorName }));
  expect(promotions).toEqual([
    { subject: second.email, actor: ADMIN.email },
    // Null is how the feed says "deploy credentials", which is what the
    // Directory renders as such — a bootstrap is an action, not a hole.
    { subject: ADMIN.email, actor: null },
  ]);
});

// --- The lockout drill (#27, scenario 25) ----------------------------------

test("the lockout drill: deploy credentials restore an Administrator with the UI unusable", async () => {
  // The state the drill has to recover from cannot be reached from the UI — the
  // last-Administrator guard is what stops it — so it is reached the way
  // reality would reach it: two Administrators, one deactivated by the other,
  // and the survivor locked out by the identity provider losing their account.
  const t = freshDeployment();
  await t.withIdentity(ADMIN).mutation(api.access.ensureUser, {});
  const second = token("user_emmanuel", "emmanuel@vctusa.com");
  await t.withIdentity(second).mutation(api.access.ensureUser, {});
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  await t.mutation(internal.bootstrap.grantAdmin, { email: second.email });

  const roster = await t.withIdentity(ADMIN).query(api.directory.roster, {});
  const emmanuel = roster.accounts.find((row) => row.email === second.email)!;
  await t
    .withIdentity(ADMIN)
    .mutation(api.directory.setActive, { userId: emmanuel.userId, isActive: false });

  // Deactivated, and refused everything — this is the account the drill brings
  // back, and there is no Administrator left able to click the button.
  expect(await t.withIdentity(second).query(api.access.me, {})).toMatchObject({
    state: "deactivated",
  });
  await expect(t.withIdentity(second).query(api.directory.roster, {})).rejects.toThrow();

  // `bunx convex run bootstrap:reactivateUser --prod`, and the Administrator is
  // back with the role they had, without a redeploy or a data edit.
  await t.mutation(internal.bootstrap.reactivateUser, { email: second.email });

  expect(await t.withIdentity(second).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "administrator" },
  });
  expect(
    (await t.withIdentity(second).query(api.directory.roster, {})).accounts.length,
  ).toBe(2);
});

test("break-glass reaches an account that has never signed in only after it does", async () => {
  // The one failure mode of the drill worth rehearsing: deploy credentials
  // cannot mint an account, because only the identity provider can. If the
  // recovery target has never signed in, the command fails loudly and the fix
  // is one sign-in, not a repo change.
  const t = freshDeployment();

  await expect(
    t.mutation(internal.bootstrap.grantAdmin, { email: NEWCOMER.email }),
  ).rejects.toThrow();

  await t.withIdentity(NEWCOMER).mutation(api.access.ensureUser, {});
  await t.mutation(internal.bootstrap.grantAdmin, { email: NEWCOMER.email });

  expect(await t.withIdentity(NEWCOMER).query(api.access.me, {})).toMatchObject({
    state: "active",
    account: { role: "administrator" },
  });
});
