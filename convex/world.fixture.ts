import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The seeded world the authorization tests are argued over, in one place so the
// read matrix (#32) and the write matrix (#33) are talking about the same
// records. A claim like "Priya can edit her promotion but not its sibling" only
// means something against a world where the sibling is real.
//
// Everything here is built by calling the public functions an Administrator
// would call, not by writing rows: the fixture is itself a demo-arc pass, so a
// regression in creation shows up before a single assertion runs.
//
// The second dot in the filename is load-bearing. Convex's bundler skips every
// entry point whose basename carries more than one dot, so this module is never
// deployed and never appears in `api`.

/** Every module the functions under test might import, test files excluded. */
export const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.*"]);

const CLERK_ISSUER = "https://tidy-marmoset-42.clerk.accounts.dev";

/** Fixed, so "overdue" means the same thing on every run. */
export const TODAY = "2026-06-15";

export function token(subject: string, email: string) {
  return { subject, issuer: CLERK_ISSUER, email, name: email };
}

export const ADMIN = token("user_admin", "dana@vctusa.com");
export const YEAR_MEMBER = token("user_year", "yolanda@vctusa.com");
export const PLAN_MEMBER = token("user_plan", "marcus@vctusa.com");
export const PROMO_MEMBER = token("user_promo", "priya@vctusa.com");
/** Signed in, granted nothing: the "access comes next" account. */
export const NEWCOMER = token("user_new", "sam@vctusa.com");

export const EVERYONE = [ADMIN, YEAR_MEMBER, PLAN_MEMBER, PROMO_MEMBER, NEWCOMER];

/** Byte-for-byte, the way scenario 14 defines "indistinguishable". */
export const bytes = (value: unknown) => JSON.stringify(value ?? null);

/** A caller with an identity, as every assertion addresses one. */
export type Caller = Pick<ReturnType<typeof convexTest>, "query" | "mutation">;

/**
 * A plan year with three chains under it, promotions under two of them, and a
 * checklist on every node — enough that "only your slice" is a real claim and
 * not one record hiding behind another.
 *
 * Grants: Yolanda holds the year, Marcus holds the Kroger plan, Priya holds one
 * Albertsons promotion and not its sibling.
 */
export async function world() {
  const t = convexTest(schema, modules);
  for (const who of EVERYONE) {
    await t.withIdentity(who).mutation(api.access.ensureUser, {});
  }
  await t.mutation(internal.bootstrap.grantAdmin, { email: ADMIN.email });
  const as = t.withIdentity(ADMIN);

  // The People directory needs a Function to hang off, and nothing creates one
  // from the function surface — reference data arrives by seed. Setup only.
  const functionId = await t.run(
    async (ctx) =>
      await ctx.db.insert("functions", {
        key: "retail_marketing",
        name: "Retail Marketing",
        kind: "internal",
        order: 1,
      }),
  );
  const carol = await as.mutation(api.people.create, {
    name: "Carol Diaz",
    functionId,
  });

  const seasonId = await as.mutation(api.seasons.create, { year: 2026 });
  await checklist(t, { tier: "season", seasonId }, 0, "Phase zero", carol);

  const plans: Record<string, Id<"chainPlans">> = {};
  for (const name of ["Albertsons", "Kroger", "Ralphs"]) {
    const chainId = await as.mutation(api.chains.create, { name });
    const chainPlanId = await as.mutation(api.chainPlans.create, {
      seasonId,
      chainId,
    });
    plans[name] = chainPlanId;
    await checklist(t, { tier: "chainPlan", chainPlanId }, 2, `${name} plan`, carol);
  }

  const promotions: Record<string, Id<"promotions">> = {};
  for (const [name, chain] of [
    ["Gift Sets", "Albertsons"],
    ["Spring Rosé", "Albertsons"],
    ["Holiday Endcap", "Kroger"],
  ] as const) {
    const promotionId = await as.mutation(api.promotions.create, {
      chainPlanId: plans[chain],
      name,
      startDate: "2026-11-01",
      endDate: "2026-12-24",
    });
    promotions[name] = promotionId;
    await checklist(t, { tier: "promotion", promotionId }, 6, name, carol);
  }

  await t.mutation(internal.bootstrap.grantAccess, {
    email: YEAR_MEMBER.email,
    scope: { tier: "season", seasonId },
  });
  await t.mutation(internal.bootstrap.grantAccess, {
    email: PLAN_MEMBER.email,
    scope: { tier: "chainPlan", chainPlanId: plans.Kroger },
  });
  await t.mutation(internal.bootstrap.grantAccess, {
    email: PROMO_MEMBER.email,
    scope: { tier: "promotion", promotionId: promotions["Gift Sets"] },
  });

  return { t, seasonId, plans, promotions, carol, functionId };
}

/**
 * Three tasks on one owner, in the three states the whole tool is about: work
 * nobody owns, work that is stuck, and work that is late. Every rollup and
 * every rail entry in these tests traces back to one of these.
 */
async function checklist(
  t: ReturnType<typeof convexTest>,
  owner:
    | { tier: "season"; seasonId: Id<"seasons"> }
    | { tier: "chainPlan"; chainPlanId: Id<"chainPlans"> }
    | { tier: "promotion"; promotionId: Id<"promotions"> },
  phase: 0 | 2 | 6,
  label: string,
  personId: Id<"people">,
) {
  const as = t.withIdentity(ADMIN);
  await as.mutation(api.tasks.create, { owner, phase, name: `${label}: unowned` });

  const blocked = await as.mutation(api.tasks.create, {
    owner,
    phase,
    name: `${label}: stuck`,
    responsiblePersonIds: [personId],
  });
  await as.mutation(api.tasks.setStatus, {
    taskId: blocked,
    status: "blocked",
    blockedReason: "No inventory at distributor",
  });

  await as.mutation(api.tasks.create, {
    owner,
    phase,
    name: `${label}: late`,
    eta: "2026-01-05",
    responsiblePersonIds: [personId],
  });
}
