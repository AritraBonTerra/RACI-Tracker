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

/**
 * The fake Clerk instance every suite signs tokens as. `convex/auth.config.ts`
 * verifies `iss` exactly, so this string is the whole difference between a test
 * that authenticates and one that does not — it lives here, once, rather than
 * being retyped per file.
 */
export const CLERK_ISSUER = "https://tidy-marmoset-42.clerk.accounts.dev";

/** A deployment with nothing in it, as a fresh `convex deploy` leaves one. */
export const harness = () => convexTest(schema, modules);

/** Fixed, so "overdue" means the same thing on every run. */
export const TODAY = "2026-06-15";

/**
 * A verified session token, shaped the way `docs/runbooks/clerk-setup.md`
 * configures Clerk to mint one: `email` and `name` are both customizations, and
 * both are required — neither is in Clerk's default token.
 *
 * The name is deliberately *not* the email. An identity whose two claims carry
 * the same string cannot tell "the app shows the editor's name" apart from "the
 * app shows the editor's work address", which is the distinction the stamp is
 * built on (#30, story 28).
 */
export function token(subject: string, email: string, name = displayNameFor(email)) {
  return { subject, issuer: CLERK_ISSUER, email, name };
}

/** "sam.rivera@vctusa.com" -> "Sam Rivera": a stand-in for `{{user.full_name}}`. */
function displayNameFor(email: string): string {
  return (email.split("@")[0] ?? email)
    .split(/[._-]+/)
    .filter((word) => word.length > 0)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export const ADMIN = token("user_admin", "dana@vctusa.com", "Dana Whitfield");
export const YEAR_MEMBER = token("user_year", "yolanda@vctusa.com", "Yolanda Esparza");
export const PLAN_MEMBER = token("user_plan", "marcus@vctusa.com", "Marcus Bell");
export const PROMO_MEMBER = token("user_promo", "priya@vctusa.com", "Priya Raman");
/** Signed in, granted nothing: the "access comes next" account. */
export const NEWCOMER = token("user_new", "sam@vctusa.com", "Sam Nakamura");

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
