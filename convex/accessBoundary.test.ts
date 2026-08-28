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

/** The public function factories: anything built from these is client-callable. */
const PUBLIC_FACTORIES = new Set(["query", "mutation", "action"]);

/** Which public factories a module imports from the generated server module. */
function publicFactoriesIn(file: string): string[] {
  const source = readFileSync(CONVEX_DIR + file, "utf8");
  const imports = source.matchAll(
    /import\s*(?:type\s*)?{([^}]*)}\s*from\s*"\.\/_generated\/server"/g,
  );
  return [...imports]
    .flatMap((match) => match[1].split(","))
    .map((clause) => clause.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
    .filter((name) => PUBLIC_FACTORIES.has(name));
}

function functionModules(): string[] {
  return readdirSync(CONVEX_DIR)
    .filter((file) => file.endsWith(".ts"))
    // Convex skips names with a second dot (tests, auth.config) as entry points.
    .filter((file) => (file.match(/\./g) ?? []).length === 1)
    .filter((file) => file !== "schema.ts")
    .sort();
}

test("only the access module builds public functions from the raw factories", () => {
  const offenders = functionModules()
    .filter((file) => file !== ACCESS_MODULE && !AWAITING_MIGRATION.includes(file))
    .filter((file) => publicFactoriesIn(file).length > 0);

  expect(offenders).toEqual([]);
});

test("every module awaiting migration is still unguarded", () => {
  // Keeps the exemption list honest: migrate a module, delete its line.
  const alreadyMigrated = AWAITING_MIGRATION.filter(
    (file) => publicFactoriesIn(file).length === 0,
  );

  expect(alreadyMigrated).toEqual([]);
});

test("the deploy-credential module exposes nothing publicly", () => {
  // Bootstrap and break-glass are unreachable from clients because they are
  // built from the *internal* factories — Convex leaves those out of `api`
  // entirely. Nothing in the module may reach for a public one.
  expect(publicFactoriesIn("bootstrap.ts")).toEqual([]);
  expect(publicFactoriesIn("seed.ts")).toEqual([]);
  expect(publicFactoriesIn("migrations.ts")).toEqual([]);
});
