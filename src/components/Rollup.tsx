import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

// Health counts for a checklist, in two densities: tiles at the top of a page,
// chips beside a node in the navigation tree.

export type Rollup = NonNullable<
  FunctionReturnType<typeof api.seasons.overview>
>["rollup"];

const TILES = [
  { key: "delivered", label: "Delivered", tone: "text-emerald-300" },
  { key: "inProgress", label: "In progress", tone: "text-sky-300" },
  { key: "notStarted", label: "Not started", tone: "text-ink-300" },
  { key: "blocked", label: "Blocked", tone: "text-rose-300" },
  { key: "overdue", label: "Overdue", tone: "text-amber-300" },
  { key: "unassigned", label: "Unassigned", tone: "text-rose-300" },
] as const satisfies ReadonlyArray<{ key: keyof Rollup; label: string; tone: string }>;

export function RollupTiles({ rollup }: { rollup: Rollup }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 sm:grid-cols-4 lg:grid-cols-7">
      {/* Seven tiles over two columns leaves a hole; the total takes the width
          of the row it heads instead. */}
      <Tile
        label="Tasks"
        value={rollup.total}
        tone="text-ink-100"
        className="col-span-2 sm:col-span-1"
      />
      {TILES.map((tile) => (
        <Tile
          key={tile.key}
          label={tile.label}
          value={rollup[tile.key]}
          tone={rollup[tile.key] === 0 ? "text-ink-600" : tile.tone}
        />
      ))}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  className = "",
}: {
  label: string;
  value: number;
  tone: string;
  className?: string;
}) {
  return (
    <div className={`bg-ink-900 px-3 py-2.5 ${className}`}>
      <p className={`text-xl leading-tight font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
      <p className="text-2xs text-ink-500">{label}</p>
    </div>
  );
}

/** Adds up the rollups hanging off a navigation tree, for a "whole season" node. */
export function mergeRollups(rollups: readonly Rollup[]): Rollup {
  return rollups.reduce(
    (total, one) => ({
      total: total.total + one.total,
      delivered: total.delivered + one.delivered,
      inProgress: total.inProgress + one.inProgress,
      blocked: total.blocked + one.blocked,
      notStarted: total.notStarted + one.notStarted,
      overdue: total.overdue + one.overdue,
      unassigned: total.unassigned + one.unassigned,
      missingAccountable: total.missingAccountable + one.missingAccountable,
    }),
    {
      total: 0,
      delivered: 0,
      inProgress: 0,
      blocked: 0,
      notStarted: 0,
      overdue: 0,
      unassigned: 0,
      missingAccountable: 0,
    },
  );
}

/** The compact form: only the numbers worth interrupting someone for. */
export function RollupChips({ rollup }: { rollup: Rollup }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-3xs font-semibold tabular-nums">
      {rollup.unassigned > 0 && (
        <span
          title={`${rollup.unassigned} unassigned — no named Responsible`}
          className="rounded bg-rose-500 px-1 text-rose-50"
        >
          {rollup.unassigned}U
        </span>
      )}
      {rollup.blocked > 0 && (
        <span
          title={`${rollup.blocked} blocked`}
          className="rounded bg-rose-500/20 px-1 text-rose-300"
        >
          {rollup.blocked}B
        </span>
      )}
      {rollup.overdue > 0 && (
        <span
          title={`${rollup.overdue} overdue`}
          className="rounded bg-amber-500/20 px-1 text-amber-300"
        >
          {rollup.overdue}!
        </span>
      )}
      <span
        title={`${rollup.delivered} of ${rollup.total} delivered`}
        className="text-ink-500"
      >
        {rollup.delivered}/{rollup.total}
      </span>
    </span>
  );
}
