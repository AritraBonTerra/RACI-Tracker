import { expect, test } from "vitest";
import { assignLanes } from "./timeline";

test("segments that do not overlap share the first lane", () => {
  const { placed, lanes } = assignLanes([
    { phase: 4, left: 0, width: 10 },
    { phase: 5, left: 10, width: 20 },
    { phase: 6, left: 30, width: 5 },
  ]);
  expect(placed.map((segment) => segment.lane)).toEqual([0, 0, 0]);
  expect(lanes).toBe(1);
});

test("coincident inferred windows for phases 6 and 7 land on separate lanes", () => {
  // A promotion with no task ETAs: both post-promotion phases start at its end
  // date and get the same two-week window.
  const { placed, lanes } = assignLanes([
    { phase: 5, left: 20, width: 30 },
    { phase: 6, left: 50, width: 6 },
    { phase: 7, left: 50, width: 6 },
  ]);
  expect(placed.map((segment) => [segment.phase, segment.lane])).toEqual([
    [5, 0],
    [6, 0],
    [7, 1],
  ]);
  expect(lanes).toBe(2);
});

test("a later segment reuses a lane once it is free", () => {
  const { placed, lanes } = assignLanes([
    { left: 0, width: 10 },
    { left: 5, width: 10 },
    { left: 12, width: 3 },
  ]);
  expect(placed.map((segment) => segment.lane)).toEqual([0, 1, 0]);
  expect(lanes).toBe(2);
});

test("an empty row still has one lane", () => {
  expect(assignLanes([])).toEqual({ placed: [], lanes: 1 });
});

test("a phase pushed late by its ETA does not inflate the lane count", () => {
  // Phase 4's ETA lands after phase 5 started; only two segments ever overlap,
  // so two lanes suffice, and the output keeps phase order.
  const { placed, lanes } = assignLanes([
    { phase: 4, left: 40, width: 10 },
    { phase: 5, left: 20, width: 30 },
    { phase: 6, left: 50, width: 6 },
    { phase: 7, left: 50, width: 6 },
  ]);
  expect(placed.map((segment) => segment.phase)).toEqual([4, 5, 6, 7]);
  expect(lanes).toBe(2);
  expect(placed[2]?.lane).not.toBe(placed[3]?.lane);
});
