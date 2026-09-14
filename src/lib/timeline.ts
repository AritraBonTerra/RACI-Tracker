// Lane allocation for the dashboard's year view: segments drawn on one row that
// overlap in time take separate lanes instead of painting over each other.

/**
 * Gives each segment, in the order given, the first lane whose previous
 * segment ends at or before this one starts. Phases 6 and 7 both begin when a
 * promotion ends, so without task ETAs their inferred windows coincide; this
 * is what keeps both visible. `lanes` is never below one so an empty row still
 * has a height to draw the grid in.
 */
export function assignLanes<T extends { left: number; width: number }>(
  segments: readonly T[],
): { placed: Array<T & { lane: number }>; lanes: number } {
  // Greedy allocation only stays minimal when segments are visited in start
  // order, and a late ETA can push an earlier phase after a later one; so
  // allocate in start order but hand the segments back in the order given.
  const order = segments
    .map((_, index) => index)
    .sort((a, b) => {
      const s = segments[a] as T;
      const t = segments[b] as T;
      return s.left - t.left || a - b;
    });
  const laneEnds: number[] = [];
  const laneOf = new Map<number, number>();
  for (const index of order) {
    const segment = segments[index] as T;
    const free = laneEnds.findIndex((end) => end <= segment.left);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = segment.left + segment.width;
    laneOf.set(index, lane);
  }
  const placed = segments.map((segment, index) => ({ ...segment, lane: laneOf.get(index) ?? 0 }));
  return { placed, lanes: Math.max(laneEnds.length, 1) };
}
