import type { ReactNode } from "react";
import { daysBetween, formatDay, MONTHS } from "../lib/dates";
import type { PathwayHeadline, PathwayPhase } from "../lib/pathway";
import { pathwayHeadline } from "../lib/pathway";

// The Pathway (CONTEXT.md): phase chips for *what's done*, a thin time rail for
// *when*, one headline call to action. It sits at the top of every tier view so
// nobody scrolls to learn whether the cycle is on track. Visual only — it never
// gates anything.

const STATE_FILL: Record<PathwayPhase["state"], string> = {
  done: "bg-emerald-500",
  ok: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-rose-500",
};

export function Pathway({
  phases,
  today,
  children,
}: {
  phases: readonly PathwayPhase[];
  today: string;
  /** Extra rows under the rail — the plan-year view slots its chain list here. */
  children?: ReactNode;
}) {
  const headline = pathwayHeadline(phases, today);
  return (
    <section className="rounded-xl border border-ink-800 bg-ink-900/60 px-4 pt-3 pb-4">
      <Headline headline={headline} />
      <div className="flex gap-2 overflow-x-auto pt-3 pb-1">
        {phases.map((phase) => (
          <PhaseChip key={phase.phase} phase={phase} today={today} />
        ))}
      </div>
      <Rail phases={phases} today={today} />
      {children}
    </section>
  );
}

function Headline({ headline }: { headline: PathwayHeadline }) {
  const tone = {
    red: "bg-rose-500/10 text-rose-200",
    amber: "bg-amber-500/10 text-amber-200",
    ok: "text-emerald-300",
  }[headline.tone];
  const icon = { red: "⚠", amber: "◔", ok: "✓" }[headline.tone];
  return (
    <p className={`flex items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-sm ${tone}`}>
      <span aria-hidden>{icon}</span>
      <span>{headline.text}</span>
    </p>
  );
}

function chipBadge(phase: PathwayPhase, today: string): ReactNode {
  const { counts, window, state } = phase;
  if (counts.total === 0) return <span className="text-3xs text-ink-500">no tasks</span>;
  if (counts.overdue > 0)
    return <span className="text-3xs font-semibold text-rose-300">⚠ {counts.overdue} overdue</span>;
  if (counts.blocked > 0)
    return <span className="text-3xs font-semibold text-rose-300">⚠ {counts.blocked} blocked</span>;
  if (state === "red")
    return <span className="text-3xs font-semibold text-rose-300">⚠ past due</span>;
  if (state === "amber" && window !== null)
    return (
      <span className="text-3xs font-semibold text-amber-300">
        ◔ due in {daysBetween(today, window.end)}d
      </span>
    );
  if (state === "done")
    return <span className="text-3xs font-semibold text-emerald-300">✓ done</span>;
  return <span className="text-3xs text-ink-500">on track</span>;
}

function PhaseChip({ phase, today }: { phase: PathwayPhase; today: string }) {
  const { counts, window } = phase;
  const rest = counts.total - counts.delivered - counts.inProgress - counts.blocked;
  const tip = [
    `Phase ${phase.phase} · ${phase.title}`,
    window === null
      ? "Unscheduled — no anchor date, no task ETAs"
      : `Window ${formatDay(window.start, today)} – ${formatDay(window.end, today)}${window.inferred ? " (end inferred)" : ""}`,
    `${counts.delivered}/${counts.total} delivered · ${counts.inProgress} in progress · ${counts.blocked} blocked`,
    ...(counts.overdue > 0 ? [`Overdue: ${counts.overdueNames.join(", ")}`] : []),
  ].join("\n");

  return (
    <div
      title={tip}
      className={`relative min-w-28 flex-1 rounded-lg border bg-ink-950/60 px-2.5 py-2 ${
        phase.current ? "border-sand-500" : "border-ink-800"
      }`}
    >
      {phase.current && (
        <span className="absolute -top-2 left-2 rounded-full bg-sand-500 px-1.5 text-3xs font-bold tracking-wide text-ink-fixed uppercase">
          Here
        </span>
      )}
      <p className="truncate text-2xs font-semibold text-ink-100">
        P{phase.phase} · {phase.title}
      </p>
      {/* Delivered / in-progress / blocked composition; the track is the rest.
          Colour never changes the math (CONTEXT.md: Pathway). */}
      <div className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-ink-800">
        {counts.delivered > 0 && (
          <i className="h-full bg-emerald-500" style={{ flex: counts.delivered }} />
        )}
        {counts.inProgress > 0 && (
          <i className="h-full bg-sky-400" style={{ flex: counts.inProgress }} />
        )}
        {counts.blocked > 0 && (
          <i className="h-full bg-rose-500" style={{ flex: counts.blocked }} />
        )}
        {rest > 0 && <i className="h-full" style={{ flex: rest }} />}
      </div>
      <p className="mt-1 flex items-baseline justify-between gap-2 text-2xs text-ink-400">
        <span className="tabular-nums">
          {counts.total === 0 ? "—" : `${counts.delivered}/${counts.total}`}
        </span>
        {chipBadge(phase, today)}
      </p>
    </div>
  );
}

/** First-of-month gridlines between two ISO days, as rail percentages. */
function monthTicks(domainStart: string, domainEnd: string, x: (iso: string) => number) {
  const ticks: Array<{ left: number; label: string }> = [];
  let year = Number(domainStart.slice(0, 4));
  let month = Number(domainStart.slice(5, 7)) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  for (;;) {
    const iso = `${year}-${String(month).padStart(2, "0")}-01`;
    if (iso >= domainEnd) return ticks;
    ticks.push({ left: x(iso), label: MONTHS[month - 1] });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

function Rail({ phases, today }: { phases: readonly PathwayPhase[]; today: string }) {
  const windows = phases.flatMap((phase) =>
    phase.window === null ? [] : [{ phase, window: phase.window }],
  );
  if (windows.length === 0) return null;

  const bounds = [...windows.flatMap(({ window }) => [window.start, window.end]), today];
  const lo = bounds.reduce((a, b) => (a < b ? a : b));
  const hi = bounds.reduce((a, b) => (a > b ? a : b));
  const span = Math.max(daysBetween(lo, hi), 21);
  const x = (iso: string) => (100 * daysBetween(lo, iso)) / span;

  // Overlapping windows drop to a second lane so both stay readable.
  let lane = 0;
  let lastEnd = "";
  const segments = windows.map(({ phase, window }) => {
    lane = lastEnd !== "" && window.start < lastEnd ? 1 - lane : 0;
    lastEnd = window.end > lastEnd ? window.end : lastEnd;
    const left = x(window.start);
    const width = Math.max(x(window.end) - left, 1.2);
    const pct =
      phase.counts.total === 0
        ? 0
        : Math.round((100 * phase.counts.delivered) / phase.counts.total);
    return { phase, window, left, width, lane, pct };
  });

  const todayX = x(today);

  return (
    <div className="relative mt-3 mr-1 ml-1 h-12">
      {monthTicks(lo, hi, x).map((tick) => (
        <span key={tick.label + tick.left}>
          <span
            className="absolute top-6 bottom-3 w-px bg-ink-800"
            style={{ left: `${tick.left}%` }}
          />
          <span
            className="absolute bottom-0 -translate-x-1/2 text-3xs text-ink-600"
            style={{ left: `${tick.left}%` }}
          >
            {tick.label}
          </span>
        </span>
      ))}
      {segments.map(({ phase, window, left, width, lane: ownLane, pct }) => (
        <span key={phase.phase}>
          <span
            className="absolute -translate-x-full pr-1 text-3xs text-ink-500"
            style={{ left: `${left}%`, top: ownLane === 0 ? "0.35rem" : "1.1rem" }}
          >
            P{phase.phase}
          </span>
          <span
            title={`Phase ${phase.phase} · ${phase.title} — ${formatDay(window.start, today)} – ${formatDay(window.end, today)}`}
            className={`absolute h-2 overflow-hidden rounded-full bg-ink-800 ${
              phase.current ? "ring-2 ring-sand-500/80" : ""
            }`}
            style={{
              left: `${left}%`,
              width: `${width}%`,
              top: ownLane === 0 ? "0.45rem" : "1.2rem",
            }}
          >
            <i
              className={`absolute inset-y-0 left-0 ${STATE_FILL[phase.state]}`}
              style={{ width: `${pct}%` }}
            />
          </span>
        </span>
      ))}
      {todayX >= 0 && todayX <= 100 && (
        <>
          <span
            className="absolute top-0 bottom-2.5 w-px bg-sand-400"
            style={{ left: `${todayX}%` }}
          />
          <span
            className="absolute bottom-0 -translate-x-1/2 text-3xs font-bold tracking-wide text-sand-300 uppercase"
            style={{ left: `${todayX}%` }}
          >
            Today
          </span>
        </>
      )}
    </div>
  );
}
