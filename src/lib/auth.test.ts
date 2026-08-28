import { expect, test } from "vitest";
import { signInConfig } from "./auth";

// One environment variable decides whether a build can sign anyone in, and it
// is set by hand in two dashboards. The rule is small enough to state and
// important enough to assert: no environment may end up showing a sign-in
// screen that cannot complete a sign-in.
//
// There is no environment fork left to test. Development and production run the
// same two Clerk strategies (email code, Google), so the only difference between
// them is which instance the key names — which is Clerk's problem, not ours.

const LIVE = "pk_live_Y2xlcmsucmFjaS5leGFtcGxl";
const DEV = "pk_test_Y2xlcmsucmFjaS5leGFtcGxl";

test("a production key opens the same door a development key does", () => {
  expect(signInConfig(LIVE)).toEqual({ kind: "ready", publishableKey: LIVE });
  expect(signInConfig(DEV)).toEqual({ kind: "ready", publishableKey: DEV });
});

test("no key at all names the variable that is missing", () => {
  expect(signInConfig(undefined)).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_PUBLISHABLE_KEY",
  });
  expect(signInConfig("")).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_PUBLISHABLE_KEY",
  });
});

test("a variable set to blank reads as unset, and a padded one still works", () => {
  // Setting a variable to the empty string is how a dashboard says "unset".
  expect(signInConfig("   ")).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_PUBLISHABLE_KEY",
  });
  // Padding is trimmed off *the value that reaches Clerk*, not just off the
  // decision: Clerk rejects " pk_live_… " and throws on mount, which is the
  // white screen this module exists to prevent.
  expect(signInConfig(` ${LIVE} `)).toEqual({ kind: "ready", publishableKey: LIVE });
});
