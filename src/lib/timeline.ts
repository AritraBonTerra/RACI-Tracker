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
  const laneEnds: number[] = [];
  const placed = segments.map((segment) => {
    const free = laneEnds.findIndex((end) => end <= segment.left);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = segment.left + segment.width;
    return { ...segment, lane };
  });
  return { placed, lanes: Math.max(laneEnds.length, 1) };
}
