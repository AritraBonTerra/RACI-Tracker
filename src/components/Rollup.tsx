import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { Pill } from "./ui";

// Health counts for a checklist, in two densities: tiles at the top of a page,
// chips beside a node in the navigation tree.

export type Rollup = NonNullable<FunctionReturnType<typeof api.seasons.overview>>["rollup"];

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
      <p className={`text-xl leading-tight font-semibold tabular-nums ${tone}`}>{value}</p>
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

/**
 * The chip form: only the numbers worth interrupting someone for. Compact
 * ("3U") beside a tree node, spelled out ("3 unassigned") on the dashboard.
 */
export function RollupChips({ rollup, verbose = false }: { rollup: Rollup; verbose?: boolean }) {
  const chips = [
    {
      count: rollup.unassigned,
      short: "U",
      word: "unassigned",
      label: `${rollup.unassigned} unassigned — no named Responsible`,
      className: verbose ? "bg-rose-500 text-rose-50" : "rounded bg-rose-500 px-1 text-rose-50",
    },
    {
      count: rollup.blocked,
      short: "B",
      word: "blocked",
      label: `${rollup.blocked} blocked`,
      className: verbose
        ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/60 ring-inset"
        : "rounded bg-rose-500/20 px-1 text-rose-300",
    },
    {
      count: rollup.overdue,
      short: "!",
      word: "late",
      label: `${rollup.overdue} overdue`,
      className: verbose
        ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 ring-inset"
        : "rounded bg-amber-500/20 px-1 text-amber-300",
    },
  ];

  return (
    <span
      className={`flex shrink-0 items-center gap-1 text-3xs font-semibold tabular-nums ${
        verbose ? "flex-wrap" : ""
      }`}
    >
      {chips.map(
        (chip) =>
          chip.count > 0 &&
          (verbose ? (
            <Pill key={chip.word} className={chip.className} title={chip.label}>
              {chip.count} {chip.word}
            </Pill>
          ) : (
            <span
              key={chip.word}
              role="img"
              title={chip.label}
              aria-label={chip.label}
              className={chip.className}
            >
              {chip.count}
              {chip.short}
            </span>
          )),
      )}
      <span
        role="img"
        title={`${rollup.delivered} of ${rollup.total} delivered`}
        aria-label={`${rollup.delivered} of ${rollup.total} delivered`}
        className={`text-ink-500 ${verbose ? "pl-0.5 font-normal" : ""}`}
      >
        {rollup.delivered}/{rollup.total}
      </span>
    </span>
  );
}
