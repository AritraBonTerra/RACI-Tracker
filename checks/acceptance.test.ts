// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// `docs/runbooks/acceptance.md` claims, scenario by scenario, which test proves
// which of the 30 acceptance criteria (#27). A claim like that rots the first
// time someone renames a test, and a rotted one is worse than none: it says a
// security property is covered when nothing checks it any more.
//
// So the checklist is checked. Every test name it quotes has to be a test that
// exists.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHECKLIST = "docs/runbooks/acceptance.md";

/** Every `test("…")` name in the repo's suites. */
function testNames(): Set<string> {
  const dirs = ["convex/", "src/lib/", "checks/"];
  const names = new Set<string>();
  for (const dir of dirs) {
    for (const file of readdirSync(ROOT + dir)) {
      if (!file.endsWith(".test.ts")) continue;
      const source = readFileSync(ROOT + dir + file, "utf8");
      for (const match of source.matchAll(/\btest\(\s*"([^"]+)"/g)) {
        names.add(match[1]);
      }
    }
  }
  return names;
}

/** Every numbered row of the table, by the scenario number it opens with. */
function scenarioRows(): Map<number, string> {
  const rows = new Map<number, string>();
  for (const line of readFileSync(ROOT + CHECKLIST, "utf8").split("\n")) {
    const numbered = /^\|\s*(\d+)\s*\|/.exec(line);
    if (numbered !== null) rows.set(Number(numbered[1]), line);
  }
  return rows;
}

/** The test names one row quotes. */
function namesIn(row: string): string[] {
  return [...row.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

/**
 * The names the checklist quotes. Only its table cites tests — the prose below
 * it quotes what the screens say — so the table is where this reads, and a row
 * is recognised by the leading pipe.
 */
function citedNames(): string[] {
  const rows = readFileSync(ROOT + CHECKLIST, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  return [...new Set(rows.flatMap(namesIn))];
}

test("every test the acceptance checklist cites still exists", () => {
  const names = testNames();

  const missing = citedNames().filter((name) => !names.has(name));

  expect(missing).toEqual([]);
});

test("each of the thirty scenarios still points at a test or a manual run", () => {
  // Row by row, because the rot this guards against is one row at a time: a
  // scenario whose citations are edited away still leaves its number in the
  // table and leaves every other row's citations resolving, so counting either
  // one proves nothing about the row that lost its evidence.
  const rows = scenarioRows();
  const names = testNames();

  const unproven = [];
  for (let scenario = 1; scenario <= 30; scenario += 1) {
    const row = rows.get(scenario);
    if (row === undefined) {
      unproven.push(`${scenario}: no row in the table`);
      continue;
    }
    const cites = namesIn(row).some((name) => names.has(name));
    // `**manual D14**` is a claim too — it points at a written-out run below the
    // table rather than at a test, and a row may rest on that alone.
    if (!cites && !row.includes("**manual ")) {
      unproven.push(`${scenario}: cites neither a test nor a manual run`);
    }
  }

  expect(unproven).toEqual([]);
});

test("the checklist and the scan of the suites both still find things", () => {
  // Guards the guards: an empty scan on either side would satisfy every
  // assertion above without meaning anything.
  expect(citedNames().length).toBeGreaterThan(30);
  expect(testNames().has("the demo arc still runs end to end under an Administrator identity")).toBe(
    true,
  );
});
