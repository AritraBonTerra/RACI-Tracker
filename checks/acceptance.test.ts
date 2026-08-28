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

/**
 * The names the checklist quotes. Only its table cites tests — the prose below
 * it quotes what the screens say — so the table is where this reads, and a row
 * is recognised by the leading pipe.
 */
function citedNames(): string[] {
  const rows = readFileSync(ROOT + CHECKLIST, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|"));
  return [...new Set(rows.flatMap((row) => [...row.matchAll(/"([^"]+)"/g)].map((m) => m[1])))];
}

test("every test the acceptance checklist cites still exists", () => {
  const names = testNames();

  const missing = citedNames().filter((name) => !names.has(name));

  expect(missing).toEqual([]);
});

test("the checklist covers all thirty scenarios and cites real tests", () => {
  // Guards the guard: an empty scan or a checklist that stopped listing
  // scenarios would pass the assertion above without meaning anything.
  const checklist = readFileSync(ROOT + CHECKLIST, "utf8");
  for (let scenario = 1; scenario <= 30; scenario += 1) {
    expect(checklist).toContain(`| ${scenario} |`);
  }

  expect(citedNames().length).toBeGreaterThan(30);
  expect(testNames().has("the demo arc still runs end to end under an Administrator identity")).toBe(
    true,
  );
});
