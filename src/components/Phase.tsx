import type { CSSProperties, ReactNode } from "react";
import { PHASES, type PhaseNumber } from "../lib/domain";

// Phase colour, in the three shapes it is allowed to take: a numbered badge, a
// title in the phase's own hue, and a progress track with one segment per
// phase. Every surface that says "phase 3" says it through one of these, so the
// hue for phase 3 is the same on the dashboard, the sidebar, the Pathway and
// the checklist header.

/**
 * Hands a phase's hue to Tailwind through `--phase`, so a component can say
 * `bg-(--phase)` / `text-(--phase)` / `border-(--phase)` without a class per
 * phase. The eight hues themselves live in src/index.css.
 */
export function phaseStyle(phase: PhaseNumber): CSSProperties {
  return { "--phase": `var(--color-phase-${phase})` } as CSSProperties;
}

const BADGE_SIZES = {
  xs: "h-4.5 min-w-4.5 rounded px-1 text-3xs",
  sm: "h-6 w-6 rounded-md text-xs",
  md: "h-8 w-8 rounded-lg text-base",
  lg: "h-11 w-11 rounded-xl text-2xl",
} as const;

/** The phase number on a solid square of its colour. */
export function PhaseBadge({
  phase,
  size = "sm",
  className = "",
}: {
  phase: PhaseNumber;
  size?: keyof typeof BADGE_SIZES;
  className?: string;
}) {
  return (
    <span
      title={`Phase ${phase}: ${PHASES[phase].title}`}
      style={phaseStyle(phase)}
      className={`inline-flex shrink-0 items-center justify-center bg-(--phase) leading-none font-bold text-white tabular-nums ${BADGE_SIZES[size]} ${className}`}
    >
      {phase}
    </span>
  );
}

/** The phase's title, set in its own colour: "JBP & negotiation" under "Safeway". */
export function PhaseTitle({
  phase,
  className = "",
  children,
}: {
  phase: PhaseNumber;
  className?: string;
  /** Anything to append after the title, in the same line. */
  children?: ReactNode;
}) {
  return (
    <span style={phaseStyle(phase)} className={`font-semibold text-(--phase) ${className}`}>
      {PHASES[phase].title}
      {children}
    </span>
  );
}

export type PhaseProgress = {
  phase: PhaseNumber;
  total: number;
  delivered: number;
  unassigned?: number;
};

/**
 * A tier's phases as a progress track: one segment per phase in its own hue,
 * filled by how much of it is delivered, the current phase outlined. A red
 * underline marks a phase with unowned work, so a wall of promotions still
 * reads at a glance.
 */
export function PhaseSteps({
  phases,
  current,
}: {
  phases: readonly PhaseProgress[];
  current?: PhaseNumber;
}) {
  return (
    <div className="grid auto-cols-fr grid-flow-col gap-1.5">
      {phases.map((stat) => {
        const pct = stat.total === 0 ? 0 : Math.round((100 * stat.delivered) / stat.total);
        const now = stat.phase === current;
        const label = [
          `Phase ${stat.phase}: ${PHASES[stat.phase].title}`,
          stat.total === 0
            ? "nothing on this checklist"
            : `${stat.delivered}/${stat.total} delivered`,
          ...(stat.unassigned !== undefined && stat.unassigned > 0
            ? [`${stat.unassigned} unassigned`]
            : []),
        ].join(", ");
        return (
          <div
            key={stat.phase}
            role="img"
            aria-label={label}
            title={label}
            style={phaseStyle(stat.phase)}
            className="min-w-0"
          >
            <div className="flex items-baseline justify-between gap-1 text-2xs font-bold text-(--phase)">
              <span>{stat.phase}</span>
              <span className="font-medium text-ink-500 tabular-nums">
                {stat.total === 0 ? "—" : `${stat.delivered}/${stat.total}`}
              </span>
            </div>
            <div
              className={`mt-1 h-1.5 overflow-hidden rounded-full bg-(--phase)/20 ${
                now ? "outline-2 outline-offset-1 outline-(--phase)" : ""
              }`}
            >
              <div className="h-full bg-(--phase)" style={{ width: `${pct}%` }} />
            </div>
            <div
              className={`mt-1 h-0.5 rounded-sm ${
                stat.unassigned !== undefined && stat.unassigned > 0
                  ? "bg-rose-500"
                  : "bg-transparent"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
