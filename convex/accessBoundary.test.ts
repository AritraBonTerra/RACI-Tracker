// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The grep-checkable half of the access boundary (#30). Wrappers only work if
// nothing goes around them, and "we always remember to use authedQuery" is not
// a boundary — this is. One bare `query` in a new module would be a hole in
// every scope check the app has.
//
// `internalQuery` / `internalMutation` / `internalAction` are exempt: they are
// absent from `api`, so no client can reach them at all.

const CONVEX_DIR = fileURLToPath(new URL(".", import.meta.url));

/** The one module allowed to build a public function out of the raw factory. */
const ACCESS_MODULE = "access.ts";

/**
 * Modules written before the access boundary existed, still exposing public
 * functions to anonymous callers. They are migrated to the wrappers in the
 * authorization slice, and this list has to reach zero before the cutover —
 * the second assertion below fails if an entry is migrated but left here, so
 * the list cannot quietly rot.
 */
const AWAITING_MIGRATION = [
  "brands.ts",
  "chainPlans.ts",
  "chains.ts",
  "home.ts",
  "kpi.ts",
  "people.ts",
  "promotions.ts",
  "raci.ts",
  "seasons.ts",
  "taskTemplates.ts",
  "tasks.ts",
];

/**
 * The public function factories: anything built from these is client-callable.
 * `httpAction` counts — an HTTP route is reachable unauthenticated on the
 * deployment's `.convex.site` domain, which is the widest door of the four.
 */
const PUBLIC_FACTORIES = new Set(["query", "mutation", "action", "httpAction"]);

/** How a module names the generated server module, from any depth. */
const GENERATED_SERVER = String.raw`"[^"]*_generated/server"`;

/**
 * Which public factories a source file pulls out of the generated server
 * module. A namespace import is reported as one, unresolvable, offender:
 * `server.query({...})` is a bare factory that no named-import check can see,
 * so the boundary refuses the import itself rather than trying to trace it.
 *
 * Takes source rather than a path so the check is testable against the ways
 * around it (see the last test).
 */
export function publicFactoriesIn(source: string): string[] {
  const namespaced = [
    ...source.matchAll(
      new RegExp(String.raw`import\s*\*\s*as\s+(\w+)\s*from\s*${GENERATED_SERVER}`, "g"),
    ),
  ].map((match) => `* as ${match[1]}`);

  const named = [
    ...source.matchAll(
      new RegExp(String.raw`import\s*(?:type\s*)?{([^}]*)}\s*from\s*${GENERATED_SERVER}`, "g"),
    ),
  ]
    .flatMap((match) => match[1].split(","))
    .map((clause) => clause.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter((name) => PUBLIC_FACTORIES.has(name));

  return [...namespaced, ...named];
}

function factoriesInModule(relPath: string): string[] {
  return publicFactoriesIn(readFileSync(CONVEX_DIR + relPath, "utf8"));
}

/**
 * Convex's own entry-point rules, restated: a file it would deploy as a
 * function module is a file this boundary has to cover. Anything it skips —
 * `_generated`, `schema.ts`, and every name carrying a second dot (tests,
 * `auth.config.ts`, `*.fixture.ts`) — is unreachable by a client and exempt.
 *
 * Takes a path relative to `convex/`, because subdirectories are function
 * modules too: `convex/reports/leak.ts` deploys as `api.reports.leak`.
 */
export function isFunctionModule(relPath: string): boolean {
  if (!/\.[jt]sx?$/.test(relPath)) return false;
  if (relPath.startsWith("_generated/")) return false;
  if (relPath.includes(" ")) return false;
  const base = relPath.split("/").pop() ?? "";
  if (base.startsWith(".") || base.startsWith("#")) return false;
  if (base === "schema.ts" || base === "schema.js") return false;
  return (base.match(/\./g) ?? []).length === 1;
}

/** Every deployable function module under `convex/`, subdirectories included. */
function functionModules(dir = ""): string[] {
  return readdirSync(CONVEX_DIR + dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relPath = dir + entry.name;
      if (entry.isDirectory()) return functionModules(`${relPath}/`);
      return isFunctionModule(relPath) ? [relPath] : [];
    })
    .sort();
}

test("only the access module builds public functions from the raw factories", () => {
  const offenders = functionModules()
    .filter((file) => file !== ACCESS_MODULE && !AWAITING_MIGRATION.includes(file))
    .filter((file) => factoriesInModule(file).length > 0);

  expect(offenders).toEqual([]);
});

test("every module awaiting migration is still unguarded", () => {
  // Keeps the exemption list honest: migrate a module, delete its line.
  const alreadyMigrated = AWAITING_MIGRATION.filter(
    (file) => factoriesInModule(file).length === 0,
  );

  expect(alreadyMigrated).toEqual([]);
});

test("the deploy-credential module exposes nothing publicly", () => {
  // Bootstrap and break-glass are unreachable from clients because they are
  // built from the *internal* factories — Convex leaves those out of `api`
  // entirely. Nothing in the module may reach for a public one.
  expect(factoriesInModule("bootstrap.ts")).toEqual([]);
  expect(factoriesInModule("seed.ts")).toEqual([]);
  expect(factoriesInModule("migrations.ts")).toEqual([]);
});

test("the check sees the ways around it", () => {
  // The boundary is only worth what its detection is worth, so the detection
  // is itself asserted — each case here is a real way a future module could
  // build a client-callable function without the word `query` next to `./`.
  const factories = (source: string) => publicFactoriesIn(source);

  // A module one directory down imports the generated server from `../`.
  expect(factories(`import { query } from "../_generated/server";`)).toEqual(["query"]);
  expect(factories(`import { mutation } from "../../_generated/server";`)).toEqual([
    "mutation",
  ]);
  // A namespace import hides `server.query({...})` from any named-import check.
  expect(factories(`import * as server from "./_generated/server";`)).toEqual([
    "* as server",
  ]);
  // An HTTP route is public on the `.convex.site` domain, token or not.
  expect(factories(`import { httpAction } from "./_generated/server";`)).toEqual([
    "httpAction",
  ]);

  // Internal factories are unreachable from `api`, and the wrappers are the
  // point of the boundary, not a breach of it.
  expect(factories(`import { internalQuery } from "./_generated/server";`)).toEqual([]);
  expect(factories(`import { authedQuery } from "./access";`)).toEqual([]);
});

test("the module walk covers every file Convex would deploy", () => {
  // Subdirectories deploy (`convex/reports/leak.ts` -> `api.reports.leak`) and
  // so must be walked; the names Convex skips are the only exemptions.
  expect(isFunctionModule("reports/leak.ts")).toBe(true);
  expect(isFunctionModule("a/b/c/deep.ts")).toBe(true);
  expect(isFunctionModule("http.ts")).toBe(true);

  expect(isFunctionModule("schema.ts")).toBe(false);
  expect(isFunctionModule("_generated/server.ts")).toBe(false);
  expect(isFunctionModule("access.test.ts")).toBe(false);
  expect(isFunctionModule("access.fixture.ts")).toBe(false);
  expect(isFunctionModule("auth.config.ts")).toBe(false);
  expect(isFunctionModule("README.md")).toBe(false);

  // And the walk finds the real tree, not an empty list that would pass
  // every assertion above it.
  expect(functionModules()).toContain("access.ts");
  expect(functionModules()).toContain("promotions.ts");
});
