import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { CLERK_ISSUER, harness } from "./world.fixture";

// The bootstrap drill: a fresh deployment, one employee signs in, and deploy
// credentials turn them into the first Administrator. Then the break-glass
// version of the same move.

const ALICE = {
  subject: "user_2alice",
  issuer: CLERK_ISSUER,
  name: "Alice Moreno",
  email: "alice@vctusa.com",
};

/** A fresh deployment where Alice has signed in once and has no access. */
async function afterFirstSignIn() {
  const t = harness();
  await t.withIdentity(ALICE).mutation(api.access.ensureUser, {});
  return t;
}

describe("promoting the first Administrator", () => {
  test("turns the zero-access Member into an Administrator", async () => {
    const t = await afterFirstSignIn();
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      account: { role: "member" },
    });

    const result = await t.mutation(internal.bootstrap.grantAdmin, {
      email: "alice@vctusa.com",
    });

    expect(result).toMatchObject({
      changed: true,
      user: { role: "administrator", isActive: true },
    });
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: { role: "administrator" },
    });
  });

  test("accepts the Clerk user id when an email is ambiguous or absent", async () => {
    const t = harness();
    await t
      .withIdentity({ subject: "user_2ghost", issuer: CLERK_ISSUER })
      .mutation(api.access.ensureUser, {});

    await t.mutation(internal.bootstrap.grantAdmin, { clerkUserId: "user_2ghost" });

    expect(
      await t
        .withIdentity({ subject: "user_2ghost", issuer: CLERK_ISSUER })
        .query(api.access.me, {}),
    ).toMatchObject({ account: { role: "administrator" } });
  });

  test("matches an email regardless of case", async () => {
    const t = await afterFirstSignIn();
    await t.mutation(internal.bootstrap.grantAdmin, { email: "Alice@VCTusa.com" });
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      account: { role: "administrator" },
    });
  });

  test("running it twice changes nothing the second time", async () => {
    const t = await afterFirstSignIn();
    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });

    expect(
      await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" }),
    ).toMatchObject({ changed: false });
  });

  test("refuses someone who has never signed in", async () => {
    const t = await afterFirstSignIn();
    await expect(
      t.mutation(internal.bootstrap.grantAdmin, { email: "nobody@vctusa.com" }),
    ).rejects.toThrow(/sign in once first/);
  });

  test("refuses an ambiguous instruction", async () => {
    const t = await afterFirstSignIn();
    await expect(t.mutation(internal.bootstrap.grantAdmin, {})).rejects.toThrow(
      /exactly one/,
    );
    await expect(
      t.mutation(internal.bootstrap.grantAdmin, {
        email: "alice@vctusa.com",
        clerkUserId: ALICE.subject,
      }),
    ).rejects.toThrow(/exactly one/);
  });
});

describe("break-glass recovery", () => {
  test("restores an Administrator who was deactivated out of the tool", async () => {
    const t = await afterFirstSignIn();
    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });
    await deactivate(t, ALICE.subject);
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "deactivated",
    });

    await t.mutation(internal.bootstrap.reactivateUser, { email: "alice@vctusa.com" });

    // Reactivation restores exactly the prior role — it does not re-promote.
    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: { role: "administrator" },
    });
  });

  test("grantAdmin also reactivates, so a deactivation cannot lock everyone out", async () => {
    const t = await afterFirstSignIn();
    await deactivate(t, ALICE.subject);

    await t.mutation(internal.bootstrap.grantAdmin, { email: "alice@vctusa.com" });

    expect(await t.withIdentity(ALICE).query(api.access.me, {})).toMatchObject({
      state: "active",
      account: { role: "administrator" },
    });
  });

  test("reactivating an already-active account is a no-op", async () => {
    const t = await afterFirstSignIn();
    expect(
      await t.mutation(internal.bootstrap.reactivateUser, {
        email: "alice@vctusa.com",
      }),
    ).toMatchObject({ changed: false });
  });
});

/** Setup helper: offboarding gets its public mutation in the Directory slice. */
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
