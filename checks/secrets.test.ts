// @vitest-environment node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The cutover's one repo-side rule (#35): every credential lives in the Clerk,
// Google Cloud, Convex and Vercel dashboards, and nowhere else. Two runbooks
// tell a human to copy values between those dashboards and a terminal, which is
// exactly the moment one gets pasted into a file "just for a second" — so the
// rule is checked here, on every push, rather than trusted.
//
// The Entra patterns below outlived the SAML design they were written for
// (`docs/adr/0003-…`). They stay: a scanner that also catches the shapes of a
// boundary we might come back to costs nothing, and deleting a secret check
// because the secret is currently unused is how one gets committed.
//
// The scan reads what git tracks. An untracked file is not the problem this
// solves; a committed one is.

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Files git tracks, minus the ones no secret could hide in usefully — and minus
 * this one, which has to spell out the shapes it is looking for to prove it can
 * see them. Every example below is invented.
 *
 * Only regular files: git also tracks symlinks, and reading one that points at
 * a directory is an error, not a scan. Whatever a link points at is scanned
 * under its own path if it is tracked.
 */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((path) => path !== "")
    .filter(
      (path) =>
        path !== "bun.lock" &&
        path !== "checks/secrets.test.ts" &&
        !path.endsWith(".png") &&
        lstatSync(`${ROOT}${path}`).isFile(),
    );
}

/**
 * What may never be committed, and why each pattern is the shape it is.
 *
 * Publishable Clerk keys (`pk_live_…`) are deliberately absent: they ship in
 * the browser bundle and are not secrets. Everything below either authenticates
 * something or names the tenant.
 */
const FORBIDDEN: ReadonlyArray<{ what: string; pattern: RegExp }> = [
  // Clerk's secret key and Convex's deploy key: either one is full control of
  // an environment.
  { what: "a Clerk secret key", pattern: /\bsk_(?:test|live)_[A-Za-z0-9]{16,}/ },
  // Production and development keys name a deployment (`prod:witty-crab-123`);
  // preview keys name a team and a project instead, so the middle allows a
  // second colon-separated segment rather than assuming the deployment form.
  {
    what: "a Convex deploy key",
    pattern: /\b(?:prod|dev|preview):[a-z0-9-]+(?::[a-z0-9-]+)?\|[A-Za-z0-9+/=]{20,}/,
  },
  // The tenant id, in the two forms it arrives in: the Entra sign-in URL and
  // the federation metadata URL Clerk is given.
  {
    what: "an Entra tenant id",
    pattern: /(?:login\.microsoftonline\.com|sts\.windows\.net)\/[0-9a-f]{8}-[0-9a-f]{4}/i,
  },
  {
    what: "an Entra SAML metadata URL",
    pattern: /federationmetadata\/2007-06\/federationmetadata\.xml/i,
  },
  // A bare GUID is only suspicious next to the word that makes it the tenant's
  // — in any of the shapes that word arrives in. The Entra overview blade
  // labels the value "Directory (tenant) ID", so the gap between the word and
  // the GUID is spelled as "a few characters" rather than as punctuation this
  // check tried to enumerate.
  {
    what: "a tenant identifier",
    pattern: /tenant[^\n]{0,12}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  },
];

test("nothing in the repo carries a credential or names the tenant", () => {
  const found = trackedFiles().flatMap((path) => {
    const source = readFileSync(`${ROOT}${path}`, "utf8");
    return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ what }) => `${path}: ${what}`,
    );
  });

  expect(found).toEqual([]);
});

test("the scan recognises the things it is looking for", () => {
  // A check nobody has seen fail is a check nobody knows works. Each string
  // here is the real shape of the value the runbooks handle.
  //
  // The invented ones are assembled rather than written: a literal of this
  // shape is what GitHub's own push protection blocks, and being unable to
  // commit the test for a secret scanner would be a poor joke.
  const hits = (text: string) =>
    FORBIDDEN.filter(({ pattern }) => pattern.test(text)).map(({ what }) => what);

  expect(hits(`CLERK_SECRET_KEY=sk_${"live"}_9aVQm2Zt7bXpLr4KcW1yTdN6`)).toEqual([
    "a Clerk secret key",
  ]);
  expect(hits(`CONVEX_DEPLOY_KEY=prod:valuable-ferret-680|${"eyJ2MiI6IjhkNGY2YWIx"}`)).toEqual([
    "a Convex deploy key",
  ]);
  expect(
    hits("https://login.microsoftonline.com/9f4a2c18-3b7d-4e51-9a0c-2d8e6b1f5a73/saml2"),
  ).toEqual(["an Entra tenant id"]);
  expect(
    hits("https://login.microsoftonline.com/x/federationmetadata/2007-06/federationmetadata.xml"),
  ).toEqual(["an Entra SAML metadata URL"]);
  expect(
    hits(`CONVEX_DEPLOY_KEY=preview:acme-team:raci-tracker|${"eyJ2MiI6IjhkNGY2YWIx"}`),
  ).toEqual(["a Convex deploy key"]);
  expect(hits('tenantId: "9f4a2c18-3b7d-4e51-9a0c-2d8e6b1f5a73"')).toEqual(["a tenant identifier"]);
  // The label the Entra overview blade puts on the value, which is the shape a
  // copy-paste actually lands in.
  expect(hits("Directory (tenant) ID: 9f4a2c18-3b7d-4e51-9a0c-2d8e6b1f5a73")).toEqual([
    "a tenant identifier",
  ]);
  expect(hits("The tenant is 9f4a2c18-3b7d-4e51-9a0c-2d8e6b1f5a73")).toEqual([
    "a tenant identifier",
  ]);

  // And it leaves alone the values that are meant to be here: the publishable
  // key ships in the bundle, and the Convex deployment name is public.
  expect(hits("VITE_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsudmN0dXNhLmNvbSQ")).toEqual([]);
  expect(hits("https://valuable-ferret-680.convex.cloud")).toEqual([]);
});

test("local environment files stay untracked", () => {
  // The other half of the same rule: `.env.local` is where a developer's own
  // keys live, and `.env.example` is the only one of its family in the repo.
  const gitignore = readFileSync(`${ROOT}.gitignore`, "utf8");
  expect(gitignore).toMatch(/^\.env\*$/m);

  const envFiles = trackedFiles().filter((path) => path.split("/").pop()?.startsWith(".env"));
  expect(envFiles).toEqual([".env.example"]);
});
