import { expect, test } from "vitest";
import { signInMode } from "./auth";

// Which door a build opens is decided by two environment variables set by hand
// in two dashboards, and the cutover turns on getting them right (#35). The
// rule is small enough to state and important enough to assert: no environment
// may end up showing a sign-in screen that cannot complete a sign-in.

const LIVE = "pk_live_Y2xlcmsucmFjaS5leGFtcGxl";
const DEV = "pk_test_Y2xlcmsucmFjaS5leGFtcGxl";

test("production goes straight to Microsoft through the enterprise domain", () => {
  expect(signInMode(LIVE, "vctusa.com")).toEqual({
    kind: "enterprise",
    domain: "vctusa.com",
  });
});

test("a laptop with a development key and no domain opens the development door", () => {
  expect(signInMode(DEV, undefined)).toEqual({ kind: "development" });
});

test("a development instance carrying an enterprise connection uses it", () => {
  // Development instances can hold an enterprise connection too, and a build
  // that names a domain means the domain.
  expect(signInMode(DEV, "vctusa.com")).toEqual({
    kind: "enterprise",
    domain: "vctusa.com",
  });
});

test("a live key with no enterprise domain is a misconfiguration, not development", () => {
  // The cutover's sharpest trap: the production instance's only sign-in
  // strategy is enterprise SSO, so the development widget here would offer an
  // email field that refuses every employee.
  expect(signInMode(LIVE, undefined)).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_ENTERPRISE_DOMAIN",
  });
});

test("a key of an unrecognised kind is treated as production", () => {
  // Fail closed: only `pk_test_` earns the development door.
  expect(signInMode("pk_unknown_abc", undefined)).toMatchObject({
    kind: "unconfigured",
  });
});

test("no key at all names the variable that is missing", () => {
  expect(signInMode(undefined, "vctusa.com")).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_PUBLISHABLE_KEY",
  });
  expect(signInMode("", undefined)).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_PUBLISHABLE_KEY",
  });
});

test("a variable set to blank reads as unset, and a padded one still works", () => {
  // Setting a variable to the empty string is how a dashboard says "unset".
  expect(signInMode(LIVE, "   ")).toEqual({
    kind: "unconfigured",
    missing: "VITE_CLERK_ENTERPRISE_DOMAIN",
  });
  expect(signInMode(` ${LIVE} `, " vctusa.com ")).toEqual({
    kind: "enterprise",
    domain: "vctusa.com",
  });
});
