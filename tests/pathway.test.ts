import { describe, expect, test } from "bun:test";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { PROMOTION_PHASES } from "../src/lib/domain";
import { buildPathway, pathwayHeadline, promotionAnchors } from "../src/lib/pathway";

const TODAY = "2026-10-15";

let counter = 0;

/** A task document with only the fields the pathway reads set explicitly. */
function task(overrides: Partial<Doc<"tasks">> & Pick<Doc<"tasks">, "phase">): Doc<"tasks"> {
  counter += 1;
  return {
    _id: `task${counter}` as Id<"tasks">,
    _creationTime: counter,
    name: `Task ${counter}`,
    status: "not_started",
    order: counter,
    consultedPersonIds: [],
    informedPersonIds: [],
    ...overrides,
  };
}

const anchors = promotionAnchors({ startDate: "2026-11-01", endDate: "2026-11-30" });

describe("buildPathway", () => {
  test("windows come from anchors and widen to task ETAs, never guessed", () => {
    const phases = buildPathway(
      PROMOTION_PHASES,
      [task({ phase: 5, eta: "2026-10-20" }), task({ phase: 5, eta: "2026-11-05" })],
      anchors,
      5,
      TODAY,
    );
    const [planning, execution, , review] = phases;
    // Anchor end is the in-market start; the late ETA pushes it out.
    expect(planning.window).toEqual({ start: "2026-10-20", end: "2026-11-05", inferred: false });
    expect(execution.window).toEqual({ start: "2026-11-01", end: "2026-11-30", inferred: false });
    // Only a start is known for review: the end is inferred, not invented as a deadline.
    expect(review.window?.inferred).toBe(true);
    expect(planning.current).toBe(true);
    expect(execution.current).toBe(false);
  });

  test("a phase with no anchor and no ETAs is unscheduled", () => {
    const [phase] = buildPathway([1], [task({ phase: 1 })], {}, 1, TODAY);
    expect(phase.window).toBeNull();
    expect(phase.state).toBe("ok");
  });

  test("red for overdue or blocked work, amber inside the last week, done when complete", () => {
    const overdue = buildPathway(
      [5],
      [task({ phase: 5, eta: "2026-10-01", status: "in_progress" })],
      {},
      5,
      TODAY,
    )[0];
    expect(overdue.state).toBe("red");
    expect(overdue.counts.overdue).toBe(1);
    expect(overdue.counts.worstLate).toBe(14);

    const blocked = buildPathway([5], [task({ phase: 5, status: "blocked" })], {}, 5, TODAY)[0];
    expect(blocked.state).toBe("red");

    const soon = buildPathway(
      [5],
      [task({ phase: 5, eta: "2026-10-20" })],
      { 5: { start: "2026-10-01" } },
      5,
      TODAY,
    )[0];
    expect(soon.state).toBe("amber");

    const done = buildPathway(
      [5],
      [task({ phase: 5, status: "delivered", eta: "2026-09-01" })],
      {},
      5,
      TODAY,
    )[0];
    expect(done.state).toBe("done");
  });

  test("a passed window only turns red when it was real, not inferred", () => {
    const real = buildPathway(
      [5],
      [task({ phase: 5 })],
      { 5: { start: "2026-09-01", end: "2026-09-30" } },
      5,
      TODAY,
    )[0];
    expect(real.state).toBe("red");
    const inferred = buildPathway(
      [5],
      [task({ phase: 5 })],
      { 5: { end: "2026-09-30" } },
      5,
      TODAY,
    )[0];
    expect(inferred.window?.inferred).toBe(true);
    expect(inferred.state).toBe("ok");
  });
});

describe("pathwayHeadline", () => {
  test("overdue work outranks everything and names the worst lateness", () => {
    const phases = buildPathway(
      PROMOTION_PHASES,
      [
        task({ phase: 5, eta: "2026-10-01", status: "in_progress" }),
        task({ phase: 6, status: "blocked" }),
      ],
      anchors,
      5,
      TODAY,
    );
    const headline = pathwayHeadline(phases, TODAY);
    expect(headline.tone).toBe("red");
    expect(headline.text).toContain("1 overdue task");
    expect(headline.text).toContain("14 days late");
  });

  test("a passed real window prints a formatted day, not an ISO string", () => {
    const phases = buildPathway(
      [5],
      [task({ phase: 5 })],
      { 5: { start: "2026-09-01", end: "2026-09-30" } },
      5,
      TODAY,
    );
    const headline = pathwayHeadline(phases, TODAY);
    expect(headline.tone).toBe("red");
    expect(headline.text).toContain("window ended Sep 30");
    expect(headline.text).not.toContain("2026-09-30");
  });

  test("all clear when nothing is late, blocked or closing in", () => {
    const phases = buildPathway([5], [task({ phase: 5, eta: "2026-12-01" })], {}, 5, TODAY);
    expect(pathwayHeadline(phases, TODAY)).toEqual({ tone: "ok", text: "All phases on track." });
  });
});
