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

// The stranded-session predicate. The bug it guards: Clerk's card finishes an
// in-page email-code sign-in, `setActive` resolves, the client holds the new
// session — and `clerk.session` stays null, so the gate shows "Checking your
// sign-in…" until a manual reload. The adoption race itself only exists in a
// real browser against a real Clerk instance (no seam here reaches it); this
// locks down the decision of *when* adoption is allowed to fire, and the
// browser step lives in the acceptance checklist.

import { strandedSessionId } from "./auth";

test("a completed-but-unadopted sign-in is stranded", () => {
  expect(
    strandedSessionId({
      loaded: true,
      session: null,
      client: { lastActiveSessionId: "sess_abc" },
    }),
  ).toBe("sess_abc");
});

test("nothing is stranded before Clerk loads, while signed in, or after sign-out", () => {
  // Not loaded: the boot path will adopt it; adopting first would race it.
  expect(
    strandedSessionId({
      loaded: false,
      session: null,
      client: { lastActiveSessionId: "sess_abc" },
    }),
  ).toBeNull();
  // An active session means there is nothing to recover.
  expect(
    strandedSessionId({
      loaded: true,
      session: { id: "sess_abc" },
      client: { lastActiveSessionId: "sess_abc" },
    }),
  ).toBeNull();
  // Signed out: the client names no session, so the hook must stay quiet
  // rather than resurrect the one that just ended.
  expect(
    strandedSessionId({ loaded: true, session: null, client: { lastActiveSessionId: null } }),
  ).toBeNull();
  expect(strandedSessionId({ loaded: true, session: null, client: null })).toBeNull();
});
