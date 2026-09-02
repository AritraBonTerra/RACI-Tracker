// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
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
 * Modules still reaching for a raw factory instead of a wrapper.
 *
 * Empty as of the scoped-writes slice (#33): every public query went behind a
 * wrapper with scoped reads (#32) and every public mutation followed here, so
 * the boundary now holds by construction rather than by exemption. A new entry
 * in this table is a hole being opened on purpose, and the first assertion
 * below is what makes it impossible to open one by accident.
 *
 * Exact per-module lists rather than a list of filenames, so migrating half a
 * module is visible: the second assertion below fails both when an entry is
 * migrated and left here and when a module quietly picks a factory back up.
 */
const AWAITING_MIGRATION: Record<string, readonly string[]> = {};

/**
 * The public function factories: anything built from these is client-callable.
 * `httpAction` counts — an HTTP route is reachable unauthenticated on the
 * deployment's `.convex.site` domain, which is the widest door of the four.
 */
const PUBLIC_FACTORIES = new Set(["query", "mutation", "action", "httpAction"]);

/** How a module names the generated server module, from any depth. */
const GENERATED_SERVER = '"[^"]*_generated/server"';

/**
 * Which public factories a source file pulls out of the generated server
 * module, by import *or* by re-export. A namespace form is reported as one,
 * unresolvable, offender: `server.query({...})` is a bare factory that no
 * named check can see, and `export * from "./_generated/server"` hands the
 * whole set to whoever imports the module, so the boundary refuses the
 * statement itself rather than trying to trace it.
 *
 * Re-exports count because the raw factory reaching a second module launders
 * it: `export { mutation } from "./_generated/server"` in a shared helper turns
 * `import { mutation } from "./model"` into an unguarded public function that a
 * check reading only `_generated/server` import sites would call clean.
 *
 * Takes source rather than a path so the check is testable against the ways
 * around it (see the last test).
 */
function publicFactoriesIn(source: string): string[] {
  // `import` and `export` share a grammar here; only the keyword differs.
  const statements = (keyword: string, clause: string) =>
    [
      ...source.matchAll(
        new RegExp(String.raw`${keyword}\s*${clause}\s*from\s*${GENERATED_SERVER}`, "g"),
      ),
    ].map((match) => match[1]);

  const namespaced = [
    ...statements("import", String.raw`\*\s*as\s+(\w+)`).map((name) => `* as ${name}`),
    // `export *` binds no name of its own, so there is nothing to report but
    // the statement.
    ...statements("export", String.raw`(\*(?:\s*as\s+\w+)?)`).map(() => "export *"),
  ];

  // Both sides of an `as` are checked: the local name is what an import site
  // reaches for, the exported name is what a consumer of this module writes.
  const named = [
    ...statements("import", String.raw`(?:type\s*)?{([^}]*)}`),
    ...statements("export", String.raw`(?:type\s*)?{([^}]*)}`),
  ]
    .flatMap((names) => names.split(","))
    .flatMap((clause) =>
      clause
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/),
    )
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
function isFunctionModule(relPath: string): boolean {
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

/** What a module reaches for, deduplicated and ordered so lists compare. */
function factorySet(relPath: string): string[] {
  return [...new Set(factoriesInModule(relPath))].sort();
}

test("only the access module builds public functions from the raw factories", () => {
  const offenders = functionModules()
    .filter((file) => file !== ACCESS_MODULE)
    .filter(
      (file) =>
        factorySet(file).join() !== (AWAITING_MIGRATION[file] ?? []).join() &&
        factorySet(file).length > 0,
    );

  expect(offenders).toEqual([]);
});

test("every module awaiting migration still reaches for exactly what it claims", () => {
  // Keeps the exemption table honest in both directions: migrate a module's
  // last factory and its line has to go, add one back and the line has to grow.
  const actual = Object.fromEntries(
    Object.keys(AWAITING_MIGRATION).map((file) => [file, factorySet(file)]),
  );

  expect(actual).toEqual(AWAITING_MIGRATION);
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
  expect(factories(`import { mutation } from "../../_generated/server";`)).toEqual(["mutation"]);
  // A namespace import hides `server.query({...})` from any named-import check.
  expect(factories(`import * as server from "./_generated/server";`)).toEqual(["* as server"]);
  // An HTTP route is public on the `.convex.site` domain, token or not.
  expect(factories(`import { httpAction } from "./_generated/server";`)).toEqual(["httpAction"]);
  // A re-export launders the factory through a module every other one already
  // imports: `import { mutation } from "./model"` would look clean forever.
  expect(factories(`export { mutation, query } from "./_generated/server";`)).toEqual([
    "mutation",
    "query",
  ]);
  // Renaming on the way out hides the factory's name from the export site, so
  // both sides of the `as` are read.
  expect(factories(`export { mutation as write } from "./_generated/server";`)).toEqual([
    "mutation",
  ]);
  expect(factories(`import { query as ask } from "./_generated/server";`)).toEqual(["query"]);
  // A star re-export hands over the whole set, naming none of it.
  expect(factories(`export * from "./_generated/server";`)).toEqual(["export *"]);
  expect(factories(`export * as server from "../_generated/server";`)).toEqual(["export *"]);

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
