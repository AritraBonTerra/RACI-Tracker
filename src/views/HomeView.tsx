import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhaseBadge, PhaseSteps, PhaseTitle, phaseStyle } from "../components/Phase";
import { HeaderSkeleton, NotFound, PageHeader } from "../components/page";
import { AssignButton } from "../components/RaciEditor";
import { type Rollup, RollupChips } from "../components/Rollup";
import { EmptyState, Skeleton } from "../components/ui";
import { daysBetween, dueLabel, formatDay, formatRange, isOverdue } from "../lib/dates";
import {
  ALL_PHASES,
  CONTEXT_HINT,
  PHASES,
  type PhaseNumber,
  responsiblesOf,
  STATUSES,
} from "../lib/domain";
import { monthTicks } from "../lib/pathway";
import type { PeopleDirectory } from "../lib/people";
import { href, placeRoute } from "../lib/router";
import { assignLanes } from "../lib/timeline";

// The dashboard. Everything Emmanuel asked to see on one screen: every promotion
// grouped by chain with how far through its phases it is, and — louder than
// anything else — the work nobody owns, the work that is stuck, and the work
// that is late. If this screen is calm, the cycle is under control.
//
// Two views of the same data. "Cycle" (the default) opens with the eight phases
// as a strip, each carrying whatever is standing in it, then the chains and the
// attention rail. "Timeline" lays the same plans and promotions across the
// calendar year, one bar each, segmented by phase, with today drawn down the
// page. The headline numbers and the attention lists are the same in both.

type Dashboard = NonNullable<FunctionReturnType<typeof api.home.dashboard>>;
type ChainGroup = Dashboard["chains"][number];
type PhaseStat = NonNullable<Dashboard["phaseZero"]>["phases"][number];
type Attention = Dashboard["attention"];
type AttentionItem = Attention["unassigned"][number];

type View = "cycle" | "timeline";
const VIEW_KEY = "raci.dashboard.view";

function savedView(): View {
  return localStorage.getItem(VIEW_KEY) === "timeline" ? "timeline" : "cycle";
}

export function HomeView({
  seasonId,
  today,
  people,
}: {
  seasonId: Id<"seasons">;
  today: string;
  people: PeopleDirectory;
}) {
  const data = useQuery(api.home.dashboard, { seasonId, today });
  const [view, setView] = useState<View>(savedView);

  if (data === undefined) return <DashboardSkeleton />;
  if (data === null) return <NotFound />;

  const promotionCount = data.chains.reduce((count, group) => count + group.promotions.length, 0);
  const choose = (next: View) => {
    localStorage.setItem(VIEW_KEY, next);
    setView(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Year ${data.season.label}`}
        meta={
          <>
            <span className="text-ink-300">{formatDay(today)}</span>
            <span>
              {data.chains.length} chain plan{data.chains.length === 1 ? "" : "s"}
            </span>
            <span>
              {promotionCount} promotion{promotionCount === 1 ? "" : "s"}
            </span>
            <span>{data.rollup.total} tasks on the checklists</span>
          </>
        }
        actions={<ViewSwitch view={view} onChange={choose} />}
      />

      <Headline rollup={data.rollup} />

      {view === "cycle" ? (
        <>
          <CycleStrip data={data} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            {/* Stacked on a phone the rail is the point of the screen, so it comes
                first; side by side it belongs on the right. */}
            <NeedsAttention attention={data.attention} today={today} people={people} />
            <div className="flex flex-col gap-4 xl:-order-1">
              {data.phaseZero !== null && <SeasonCard data={data} phaseZero={data.phaseZero} />}
              {data.chains.map((group) => (
                <ChainSection key={group.chainPlanId} group={group} today={today} />
              ))}
              {data.chains.length === 0 && <NoChains />}
            </div>
          </div>
        </>
      ) : (
        <>
          <Timeline data={data} today={today} />
          <NeedsAttention attention={data.attention} today={today} people={people} wide />
        </>
      )}
    </div>
  );
}

/** Cycle or Timeline: two ways of looking at one year. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const options: Array<{ value: View; label: string; hint: string }> = [
    { value: "cycle", label: "Cycle", hint: "Every plan and promotion by phase" },
    { value: "timeline", label: "Timeline", hint: "The same work laid across the year" },
  ];
  return (
    <div className="flex rounded-lg bg-ink-800/70 p-0.5 ring-1 ring-ink-700/60 ring-inset">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
            view === option.value
              ? "bg-ink-900 text-ink-50 shadow-sm"
              : "text-ink-400 hover:text-ink-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The numbers that decide whether anyone needs to do something today. */
function Headline({ rollup }: { rollup: Rollup }) {
  const progress = rollup.total === 0 ? 0 : Math.round((rollup.delivered / rollup.total) * 100);
  const attention = rollup.unassigned + rollup.blocked + rollup.overdue;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
      {/* Unassigned is the state the tool exists to surface, so it is the one
          tile that fills with colour when it is not zero. */}
      <div
        className={`rounded-xl border p-4 ${
          rollup.unassigned > 0
            ? "border-rose-500/70 bg-rose-500/10"
            : "border-ink-800 bg-ink-900/60"
        }`}
      >
        <p className="flex items-baseline gap-2.5">
          <span
            className={`text-4xl leading-none font-extrabold tracking-tight tabular-nums ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-ink-600"
            }`}
          >
            {rollup.unassigned}
          </span>
          <span
            className={`text-sm font-semibold ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-ink-500"
            }`}
          >
            Unassigned
          </span>
        </p>
        <p className="mt-2 text-xs text-ink-400">
          {rollup.unassigned > 0
            ? "No named Responsible. A function default is not a person."
            : "Every task on every checklist has a named Responsible."}
        </p>
      </div>

      <Stat
        value={rollup.overdue}
        label="Overdue"
        tone="text-amber-300"
        note="Past ETA and not delivered."
        zeroNote="Nothing has slipped past its ETA."
      />
      <Stat
        value={rollup.blocked}
        label="Blocked"
        tone="text-rose-300"
        note="Stopped, with a stated reason."
        zeroNote="Nothing is stuck waiting on someone."
      />

      <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl leading-none font-extrabold tracking-tight text-emerald-300 tabular-nums">
            {rollup.delivered}
          </span>
          <span className="text-sm font-medium text-ink-500 tabular-nums">
            of {rollup.total} delivered
          </span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-500">
          {attention === 0
            ? "Nothing needs attention right now."
            : `${attention} item${attention === 1 ? "" : "s"} need attention`}
          {rollup.missingAccountable > 0 &&
            `, ${rollup.missingAccountable} with no named Accountable`}
        </p>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
  note,
  zeroNote,
}: {
  value: number;
  label: string;
  tone: string;
  note: string;
  zeroNote: string;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/60 p-4">
      <p className="flex items-baseline gap-2">
        <span
          className={`text-3xl leading-none font-extrabold tracking-tight tabular-nums ${
            value === 0 ? "text-ink-600" : tone
          }`}
        >
          {value}
        </span>
        <span className={`text-sm font-semibold ${value === 0 ? "text-ink-500" : tone}`}>
          {label}
        </span>
      </p>
      <p className="mt-2 text-xs text-ink-400">{value === 0 ? zeroNote : note}</p>
    </div>
  );
}

// --- The cycle strip ------------------------------------------------------

/**
 * What is standing in each phase right now: a name, linked to its page, and
 * how much of it needs attention — the block shows the troubled ones first.
 */
type Occupant = { key: string; label: string; to: string; trouble: number };

const troubleOf = (rollup: Rollup) => rollup.unassigned + rollup.blocked + rollup.overdue;

function occupants(data: Dashboard): ReadonlyMap<PhaseNumber, Occupant[]> {
  const here = new Map<PhaseNumber, Occupant[]>();
  const put = (phase: PhaseNumber, occupant: Occupant) => {
    here.set(phase, [...(here.get(phase) ?? []), occupant]);
  };
  if (data.phaseZero !== null)
    put(0, {
      key: data.season._id,
      label: `Year ${data.season.label}`,
      to: href({ name: "season", seasonId: data.season._id }),
      trouble: troubleOf(data.phaseZero.rollup),
    });
  for (const group of data.chains) {
    if (group.reach === "full")
      put(group.plan.currentPhase, {
        key: group.chainPlanId,
        label: group.chain?.name ?? "Chain",
        to: href({ name: "plan", chainPlanId: group.chainPlanId }),
        trouble: troubleOf(group.rollup),
      });
    for (const node of group.promotions)
      put(node.promotion.currentPhase, {
        key: node.promotion._id,
        label: node.promotion.name,
        to: href({ name: "promotion", promotionId: node.promotion._id }),
        trouble: troubleOf(node.rollup),
      });
  }
  for (const list of here.values())
    list.sort((a, b) => b.trouble - a.trouble || a.label.localeCompare(b.label));
  return here;
}

const TIER_OF_FIRST_PHASE: Partial<Record<PhaseNumber, string>> = {
  0: "Plan year",
  1: "Chain plans",
  4: "Promotions",
};

/** "23 chain plans" — what a phase's count is a count of. */
function occupantNoun(phase: PhaseNumber, count: number): string {
  const noun = phase === 0 ? "plan year" : phase <= 3 ? "chain plan" : "promotion";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The eight phases in a row, each block carrying whatever is standing in it.
 * Read left to right it is the whole year's position at a glance; an empty
 * block is dimmed rather than removed, so the shape of the cycle never changes.
 */
function CycleStrip({ data }: { data: Dashboard }) {
  const here = occupants(data);
  return (
    <section
      aria-label="The commercial cycle"
      className="grid grid-cols-3 gap-2 pt-2 md:grid-cols-4 xl:grid-cols-8"
    >
      {ALL_PHASES.map((phase) => (
        <PhaseBlock key={phase} phase={phase} who={here.get(phase) ?? []} />
      ))}
    </section>
  );
}

/** How many names a block shows before folding the rest behind "+N more". */
const PEEK = 3;

/**
 * One block of the strip. With a handful of occupants it lists them all; with
 * a hundred chains it shows the count, the three that most need attention,
 * and a "+N more" that opens the full list — scrollable, and filterable once
 * it is long enough to need it. The block's height never depends on the count.
 */
function PhaseBlock({ phase, who }: { phase: PhaseNumber; who: readonly Occupant[] }) {
  const [open, setOpen] = useState(false);
  const tier = TIER_OF_FIRST_PHASE[phase];
  const shown = who.slice(0, PEEK);
  const hidden = who.length - shown.length;

  return (
    <div
      style={phaseStyle(phase)}
      className={`relative flex min-h-28 flex-col rounded-xl border border-(--phase)/35 bg-(--phase)/10 px-3 pt-3 pb-2.5 ${
        who.length === 0 ? "opacity-55" : ""
      } ${phase === 1 || phase === 4 ? "xl:ml-1.5" : ""}`}
    >
      {tier !== undefined && (
        <span className="absolute -top-2.5 left-2.5 rounded-full border border-ink-800 bg-ink-900 px-1.5 text-3xs font-semibold text-ink-500">
          {tier}
        </span>
      )}
      <span className="text-3xl leading-none font-extrabold tracking-tight text-(--phase) tabular-nums">
        {phase}
      </span>
      <span className="mt-1.5 text-xs leading-tight font-semibold text-ink-100">
        {PHASES[phase].title}
      </span>
      {who.length > 0 && (
        <span className="mt-0.5 text-2xs font-semibold text-(--phase) tabular-nums">
          {occupantNoun(phase, who.length)}
        </span>
      )}
      {who.length > 0 && (
        <span className="mt-auto flex flex-wrap gap-1 pt-2">
          {shown.map((occupant) => (
            <OccupantPill key={occupant.key} occupant={occupant} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
              className="rounded-full border border-(--phase)/60 px-2 py-0.5 text-2xs font-semibold text-(--phase) transition hover:bg-(--phase)/15"
            >
              +{hidden} more
            </button>
          )}
        </span>
      )}
      {open && <OccupantList phase={phase} who={who} onClose={() => setOpen(false)} />}
    </div>
  );
}

function OccupantPill({ occupant }: { occupant: Occupant }) {
  return (
    <a
      href={occupant.to}
      title={
        occupant.trouble > 0
          ? `${occupant.label}: ${occupant.trouble} item${occupant.trouble === 1 ? "" : "s"} need attention`
          : occupant.label
      }
      className="flex max-w-full items-center gap-1 rounded-full bg-(--phase) px-2 py-0.5 text-2xs font-semibold text-white hover:opacity-90"
    >
      <span className="truncate">{occupant.label}</span>
      {occupant.trouble > 0 && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300 ring-1 ring-white/70"
        />
      )}
    </a>
  );
}

/** The names a block does not have room for, as a list that scrolls. */
function OccupantList({
  phase,
  who,
  onClose,
}: {
  phase: PhaseNumber;
  who: readonly Occupant[];
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // Escape and a click anywhere else both close it; a click inside is a link.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (box.current !== null && !box.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const needle = filter.trim().toLowerCase();
  const matches = needle === "" ? who : who.filter((o) => o.label.toLowerCase().includes(needle));

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`${occupantNoun(phase, who.length)} at phase ${phase}`}
      className={`absolute top-full z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl shadow-black/40 ${
        phase >= 6 ? "right-0" : "left-0"
      }`}
    >
      <header className="flex items-center gap-2 border-b border-ink-800 px-3 py-2">
        <span className="text-xs font-bold text-(--phase)">{occupantNoun(phase, who.length)}</span>
        <span className="truncate text-2xs text-ink-500">{PHASES[phase].title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded px-1 text-xs text-ink-500 hover:bg-ink-800 hover:text-ink-100"
        >
          ✕
        </button>
      </header>
      {who.length > 8 && (
        <input
          autoFocus
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name…"
          className="w-full border-b border-ink-800 bg-ink-950 px-3 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:outline-none"
        />
      )}
      <ul className="max-h-72 overflow-y-auto py-1">
        {matches.map((occupant) => (
          <li key={occupant.key}>
            <a
              href={occupant.to}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink-100 hover:bg-ink-800"
            >
              <span className="min-w-0 flex-1 truncate">{occupant.label}</span>
              {occupant.trouble > 0 && (
                <span className="rounded bg-rose-500/15 px-1 text-3xs font-bold text-rose-300 tabular-nums">
                  {occupant.trouble}
                </span>
              )}
            </a>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-3 py-3 text-center text-2xs text-ink-500">Nothing matches</li>
        )}
      </ul>
    </div>
  );
}

// --- Chains ----------------------------------------------------------------

/**
 * Phase 0 is the company-wide work every plan below is planned against — and
 * it is the Plan Year's own content, so it only appears for a viewer whose
 * grant covers the year. Everyone else's dashboard starts at the chains.
 */
function SeasonCard({
  data,
  phaseZero,
}: {
  data: Dashboard;
  phaseZero: NonNullable<Dashboard["phaseZero"]>;
}) {
  return (
    <a
      href={href({ name: "season", seasonId: data.season._id })}
      className="flex items-center gap-3.5 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 transition hover:border-ink-700 hover:bg-ink-900"
    >
      <PhaseBadge phase={0} size="md" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold tracking-tight text-ink-50">
          Year {data.season.label}
        </h2>
        <PhaseTitle phase={0} className="block truncate text-xs" />
      </div>
      <div className="hidden w-36 shrink-0 sm:block">
        <PhaseSteps phases={phaseZero.phases} current={0} />
      </div>
      <RollupChips verbose rollup={phaseZero.rollup} />
    </a>
  );
}

/** "JBP Oct 14, in 34 days" for a plan header; nothing when it is unscheduled. */
function jbpLine(jbpDate: string | undefined, today: string): string {
  if (jbpDate === undefined) return "JBP not scheduled";
  const days = daysBetween(today, jbpDate);
  const when =
    days === 0
      ? "today"
      : days > 0
        ? `in ${days} day${days === 1 ? "" : "s"}`
        : `${-days} day${days === -1 ? "" : "s"} ago`;
  return `JBP ${formatDay(jbpDate, today)}, ${when}`;
}

/**
 * One chain: its plan (phases 1–3) and every promotion under it (4–7).
 *
 * A plan the viewer reaches only as the parent of a granted promotion is a
 * heading and nothing more — no link, no phase track, no counts. It is here so
 * "Holiday Gift Sets" has a chain name over it, which is the whole of the
 * orientation the grant bought (#22, minimal parent context).
 */
function ChainSection({ group, today }: { group: ChainGroup; today: string }) {
  const chainName = group.chain?.name ?? "Chain";
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60">
      {group.reach === "full" ? (
        <>
          <header className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3.5">
            <PhaseBadge phase={group.plan.currentPhase} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-tight font-bold tracking-tight">
                <a
                  href={href({ name: "plan", chainPlanId: group.chainPlanId })}
                  className="text-ink-50 transition hover:underline"
                >
                  {chainName}
                </a>
              </h2>
              <PhaseTitle phase={group.plan.currentPhase} className="block text-sm" />
              <p className="text-xs text-ink-500">{jbpLine(group.plan.jbpDate, today)}</p>
            </div>
            <RollupChips verbose rollup={group.rollup} />
          </header>
          <div className="border-y border-ink-800/70 bg-ink-950/40 px-4 py-3">
            <PhaseSteps phases={group.phases} current={group.plan.currentPhase} />
          </div>
        </>
      ) : (
        <header className="border-b border-ink-800/70 px-4 py-3.5">
          <h2
            title={CONTEXT_HINT}
            className="cursor-default text-lg font-bold tracking-tight text-ink-400"
          >
            {chainName}
          </h2>
        </header>
      )}

      {group.promotions.length === 0 ? (
        <p className="px-4 py-4 text-xs text-ink-500">
          No promotions yet. Phases 4 to 7 appear once this plan reaches an agreement.
        </p>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]">
          {group.promotions.map((node) => (
            <a
              key={node.promotion._id}
              href={href({ name: "promotion", promotionId: node.promotion._id })}
              className="rounded-xl border border-ink-800 bg-ink-900 p-3.5 transition hover:border-ink-700"
            >
              <div className="flex items-center gap-2.5">
                <PhaseBadge phase={node.promotion.currentPhase} size="md" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-ink-50">{node.promotion.name}</h3>
                  <PhaseTitle phase={node.promotion.currentPhase} className="block text-xs" />
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-500">
                {formatRange(node.promotion.startDate, node.promotion.endDate, today)}
                {node.promotion.storeCount !== undefined && `, ${node.promotion.storeCount} stores`}
              </p>
              <div className="mt-3">
                <PhaseSteps phases={node.phases} current={node.promotion.currentPhase} />
              </div>
              <div className="mt-3">
                <RollupChips verbose rollup={node.rollup} />
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function NoChains() {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40">
      <EmptyState title="No chain plans in this year yet">
        A chain plan is one account for one year — Safeway 2026, Kroger 2026. Start one from the
        chain list in the sidebar and phases 1–3 appear underneath it.
      </EmptyState>
    </section>
  );
}

// --- The timeline -----------------------------------------------------------

type TimelineRow = {
  key: string;
  nested: boolean;
  phase: PhaseNumber;
  label: string;
  to: string;
  meta: string;
  rollup: Rollup;
  phases: readonly PhaseStat[];
  /** A dated milestone drawn as a tick: a plan's JBP date. */
  mark?: { iso: string; label: string };
  /**
   * For a promotion reached without its plan: the chain's name, shown over the
   * promotion but not linked, the same orientation the Cycle view's context
   * heading gives (#22).
   */
  context?: string;
};

function timelineRows(data: Dashboard, today: string): TimelineRow[] {
  const rows: TimelineRow[] = [];
  if (data.phaseZero !== null)
    rows.push({
      key: data.season._id,
      nested: false,
      phase: 0,
      label: `Year ${data.season.label}`,
      to: href({ name: "season", seasonId: data.season._id }),
      meta: PHASES[0].summary,
      rollup: data.phaseZero.rollup,
      phases: data.phaseZero.phases,
    });
  for (const group of data.chains) {
    if (group.reach === "full")
      rows.push({
        key: group.chainPlanId,
        nested: false,
        phase: group.plan.currentPhase,
        label: group.chain?.name ?? "Chain",
        to: href({ name: "plan", chainPlanId: group.chainPlanId }),
        meta: jbpLine(group.plan.jbpDate, today),
        rollup: group.rollup,
        phases: group.phases,
        mark:
          group.plan.jbpDate === undefined ? undefined : { iso: group.plan.jbpDate, label: "JBP" },
      });
    for (const node of group.promotions)
      rows.push({
        key: node.promotion._id,
        nested: group.reach === "full",
        phase: node.promotion.currentPhase,
        label: node.promotion.name,
        to: href({ name: "promotion", promotionId: node.promotion._id }),
        meta: `${formatRange(node.promotion.startDate, node.promotion.endDate, today)}${
          node.promotion.storeCount === undefined ? "" : `, ${node.promotion.storeCount} stores`
        }`,
        rollup: node.rollup,
        phases: node.phases,
        context: group.reach === "full" ? undefined : (group.chain?.name ?? "Chain"),
      });
  }
  return rows;
}

/**
 * The year as a calendar: one row per plan and promotion, its phases drawn as
 * segments where their windows fall, today as a line down the whole page. The
 * current phase is the only segment at full strength; a finished one is solid
 * but quieter; the rest are washes. A phase with no window (no anchor, no
 * ETAs) is listed after the bar as a hollow chip rather than guessed at.
 */
function Timeline({ data, today }: { data: Dashboard; today: string }) {
  const rows = timelineRows(data, today);

  // The year is the canvas; anything that spills past it (a holiday promotion's
  // review in January) stretches the canvas rather than getting cut off.
  const bounds = [
    `${data.season.year}-01-01`,
    `${data.season.year}-12-31`,
    today,
    ...rows.flatMap((row) =>
      row.phases.flatMap((stat) => {
        const window = stat.window ?? null;
        return window === null ? [] : [window.start, window.end];
      }),
    ),
  ];
  const lo = bounds.reduce((a, b) => (a < b ? a : b));
  const hi = bounds.reduce((a, b) => (a > b ? a : b));
  const span = Math.max(daysBetween(lo, hi), 1);
  const x = (iso: string) => (100 * daysBetween(lo, iso)) / span;
  const ticks = monthTicks(lo, hi);
  const todayX = x(today);

  const grid = (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.iso}
          aria-hidden
          className="absolute inset-y-0 w-px bg-ink-800/70"
          style={{ left: `${tick.left}%` }}
        />
      ))}
      <span
        aria-hidden
        className="absolute inset-y-0 z-20 w-0.5 bg-rose-500"
        style={{ left: `${todayX}%` }}
      />
    </>
  );

  return (
    <section
      aria-label="The year as a timeline"
      className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60"
    >
      <div className="grid grid-cols-[minmax(11rem,17rem)_minmax(0,1fr)] border-b border-ink-800 bg-ink-950/40">
        <p className="px-4 py-2 text-2xs font-semibold text-ink-500">Plan, promotion</p>
        <div className="relative h-10">
          {grid}
          {/* A label hugging the right edge would clip, so the last sliver
              keeps its gridline and loses its name. */}
          {ticks
            .filter((tick) => tick.left < 96)
            .map((tick) => (
              <span
                key={tick.iso}
                className="absolute bottom-1 pl-1.5 text-2xs text-ink-500"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </span>
            ))}
          <span
            className="absolute top-1 z-20 -translate-x-1/2 rounded-full bg-rose-500 px-1.5 text-3xs font-bold text-white"
            style={{ left: `${todayX}%` }}
          >
            Today
          </span>
        </div>
      </div>

      {rows.length === 0 && (
        <EmptyState title="Nothing to draw yet">
          Chain plans and promotions appear here as bars across the year once there are some.
        </EmptyState>
      )}

      {rows.map((row) => {
        // A segment keeps enough width to hold its label, so the tail of the
        // bar is measured from the drawn segments, not the raw dates.
        // `?? null` because a dashboard served by a deployment that predates
        // windows arrives without the field, and "unscheduled" is the honest
        // reading of that too.
        const segments = row.phases.flatMap((stat) => {
          const window = stat.window ?? null;
          if (window === null) return [];
          const left = x(window.start);
          const width = Math.max(x(window.end) - left, 3);
          return [{ stat, window, left, width }];
        });
        // Overlapping segments (phases 6 and 7 with no ETAs) take separate
        // lanes rather than painting over each other.
        const { placed, lanes } = assignLanes(segments);
        const unscheduled = row.phases.filter((stat) => (stat.window ?? null) === null);
        const tailX = segments.reduce((best, seg) => Math.max(best, seg.left + seg.width), 0);
        const headX = segments.reduce((best, seg) => Math.min(best, seg.left), 100);
        // Chips that would run off the right edge sit before the bar instead.
        const flip = tailX > 90 && headX > 12;

        return (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(11rem,17rem)_minmax(0,1fr)] border-b border-ink-800/70 last:border-b-0"
          >
            <div className={`flex items-center gap-3 py-3 pr-3 ${row.nested ? "pl-8" : "pl-4"}`}>
              <PhaseBadge phase={row.phase} size={row.nested ? "sm" : "md"} />
              <div className="min-w-0">
                {row.context !== undefined && (
                  <p
                    title={CONTEXT_HINT}
                    className="cursor-default truncate text-2xs font-semibold text-ink-400"
                  >
                    {row.context}
                  </p>
                )}
                <span className="flex items-center gap-2">
                  <a
                    href={row.to}
                    className={`min-w-0 truncate font-bold text-ink-50 hover:underline ${
                      row.nested ? "text-xs" : "text-sm"
                    }`}
                  >
                    {row.label}
                  </a>
                  <RollupChips rollup={row.rollup} />
                </span>
                <PhaseTitle phase={row.phase} className="block truncate text-2xs" />
                <p className="truncate text-2xs text-ink-500">{row.meta}</p>
              </div>
            </div>

            <div
              className="relative min-h-16"
              style={lanes > 2 ? { minHeight: `${lanes * 1.75}rem` } : undefined}
            >
              {grid}
              {row.mark !== undefined && (
                <span
                  className="absolute top-1 bottom-1 z-10 w-px bg-ink-400"
                  style={{ left: `${x(row.mark.iso)}%` }}
                >
                  <span className="absolute -top-0.5 left-1 text-3xs text-ink-500">
                    {row.mark.label}
                  </span>
                </span>
              )}
              {placed.map(({ stat, window, left, width, lane }) => {
                const now = stat.phase === row.phase;
                const done = stat.total > 0 && stat.delivered === stat.total;
                const title = [
                  `Phase ${stat.phase}: ${PHASES[stat.phase].title}`,
                  `${formatDay(window.start, today)} to ${formatDay(window.end, today)}${
                    window.inferred ? " (end inferred)" : ""
                  }`,
                  stat.total === 0
                    ? "nothing on the checklist"
                    : `${stat.delivered}/${stat.total} delivered`,
                ].join(", ");
                return (
                  <a
                    key={stat.phase}
                    href={row.to}
                    title={title}
                    style={{
                      ...phaseStyle(stat.phase),
                      left: `${left}%`,
                      width: `${width}%`,
                      top: `${(100 * (lane + 0.5)) / lanes}%`,
                    }}
                    className={`absolute flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-md px-2 text-2xs font-bold whitespace-nowrap ring-1 ring-ink-900 ${
                      now
                        ? "z-10 bg-(--phase) text-white"
                        : done
                          ? "bg-(--phase)/80 text-white"
                          : "bg-(--phase)/25 text-(--phase)"
                    }`}
                  >
                    {stat.phase}
                    {stat.total > 0 && (
                      <span className="ml-1.5 font-medium opacity-90">
                        {stat.delivered}/{stat.total}
                      </span>
                    )}
                  </a>
                );
              })}
              {unscheduled.length > 0 && (
                <span
                  className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 ${
                    flip ? "-translate-x-full pr-2" : "pl-2"
                  }`}
                  style={{ left: `${flip ? headX : tailX}%` }}
                >
                  {unscheduled.map((stat) => (
                    <span
                      key={stat.phase}
                      title={`Phase ${stat.phase}: ${PHASES[stat.phase].title}, unscheduled`}
                      style={phaseStyle(stat.phase)}
                      className="flex h-5 w-5 items-center justify-center rounded-md border border-dashed border-(--phase) text-2xs font-bold text-(--phase)"
                    >
                      {stat.phase}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// --- The rail -------------------------------------------------------------

const PREVIEW = 5;

const RAIL_SECTIONS = [
  {
    key: "unassigned",
    title: "Unassigned",
    note: "nobody is doing this",
    clear: "Every task has a name on it",
    tone: "danger",
    assignable: true,
  },
  {
    key: "blocked",
    title: "Blocked",
    note: "stopped, and why",
    clear: "Nothing is stuck",
    tone: "danger",
    assignable: false,
  },
  {
    key: "overdue",
    title: "Overdue",
    note: "past ETA, still open",
    clear: "Nothing is late",
    tone: "warning",
    assignable: false,
  },
] as const satisfies ReadonlyArray<{
  key: keyof Attention;
  title: string;
  note: string;
  clear: string;
  tone: "danger" | "warning";
  assignable: boolean;
}>;

function NeedsAttention({
  attention,
  today,
  people,
  wide = false,
}: {
  attention: Attention;
  today: string;
  people: PeopleDirectory;
  /** Under the timeline the three lists sit side by side instead of stacked. */
  wide?: boolean;
}) {
  const total = RAIL_SECTIONS.reduce((count, section) => count + attention[section.key].length, 0);
  const cleared = RAIL_SECTIONS.filter((section) => attention[section.key].length === 0);

  return (
    <aside className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60">
      <header className="flex items-baseline justify-between gap-3 border-b border-ink-800 px-4 py-3">
        <h2 className="text-base font-bold tracking-tight text-ink-50">Needs attention</h2>
        <span className="text-xs text-ink-500 tabular-nums">
          {total === 0 ? "all clear" : `${total} item${total === 1 ? "" : "s"}`}
        </span>
      </header>

      {total === 0 ? (
        <EmptyState tone="good" title="Nothing needs attention">
          Every task has a named Responsible, nothing is blocked, and nothing is past its ETA. This
          is what the year is supposed to look like.
        </EmptyState>
      ) : (
        <>
          <div className={wide ? "grid gap-px bg-ink-800/70 md:grid-cols-3" : ""}>
            {RAIL_SECTIONS.map((section) => (
              <Section
                key={section.key}
                title={section.title}
                note={section.note}
                items={attention[section.key]}
                tone={section.tone}
                today={today}
                people={people}
                assignable={section.assignable}
                wide={wide}
              />
            ))}
          </div>

          {/* The categories that are already clear still get a line, because
              "no blocked work" is news worth reading on this rail. */}
          {cleared.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-800 px-4 py-2 text-2xs text-ink-500">
              <span aria-hidden className="font-bold text-emerald-400">
                ✓
              </span>
              {cleared.map((section) => (
                <span key={section.key}>{section.clear}</span>
              ))}
            </p>
          )}
        </>
      )}
    </aside>
  );
}

function Section({
  title,
  note,
  items,
  tone,
  today,
  people,
  assignable = false,
  wide,
}: {
  title: string;
  note: string;
  items: readonly AttentionItem[];
  tone: "danger" | "warning";
  today: string;
  people: PeopleDirectory;
  assignable?: boolean;
  wide: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;

  const shown = showAll ? items : items.slice(0, PREVIEW);

  return (
    <section className={wide ? "bg-ink-900" : "border-b border-ink-800 last:border-b-0"}>
      <header
        className={`flex items-baseline justify-between gap-2 px-4 py-2 ${
          tone === "danger" ? "bg-rose-500/10" : "bg-amber-500/10"
        }`}
      >
        <h3
          className={`flex flex-wrap items-baseline gap-x-2 text-xs font-bold ${
            tone === "danger" ? "text-rose-300" : "text-amber-300"
          }`}
        >
          {title}
          <span className="text-2xs font-normal text-ink-500">{note}</span>
        </h3>
        <span
          className={`text-base font-extrabold tabular-nums ${
            tone === "danger" ? "text-rose-300" : "text-amber-300"
          }`}
        >
          {items.length}
        </span>
      </header>

      <ul>
        {shown.map((item) => (
          <AttentionRow
            key={item.task._id}
            item={item}
            today={today}
            people={people}
            assignable={assignable}
          />
        ))}
      </ul>

      {items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="flex w-full items-center justify-between gap-2 border-t border-ink-800/60 px-4 py-2 text-2xs font-medium text-ink-400 transition hover:bg-ink-800/60 hover:text-ink-100"
        >
          {showAll ? `Show the first ${PREVIEW}` : `Show the other ${items.length - PREVIEW}`}
          <span aria-hidden className="text-3xs">
            {showAll ? "▲" : "▼"}
          </span>
        </button>
      )}
    </section>
  );
}

function AttentionRow({
  item,
  today,
  people,
  assignable,
}: {
  item: AttentionItem;
  today: string;
  people: PeopleDirectory;
  assignable: boolean;
}) {
  const { task, place } = item;
  const late = isOverdue(task.eta, task.status, today);
  const responsibles = responsiblesOf(task)
    .map((id) => people.byId.get(id))
    .filter((person) => person !== undefined);

  return (
    <li className="border-b border-ink-800/60 last:border-b-0">
      <div className="flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-ink-800/40">
        <PhaseBadge phase={task.phase} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          {/* Deep link: the task's own row, opened and scrolled to. */}
          <a
            href={href(placeRoute(place, task._id))}
            className="block truncate text-xs font-semibold text-ink-50 hover:underline"
            title={task.spec ?? task.name}
          >
            {task.name}
          </a>
          <p className="mt-0.5 truncate text-2xs text-ink-500">
            {place.chain !== null && place.tier !== "chainPlan" && `${place.chain}, `}
            {place.label}
          </p>

          {task.status === "blocked" && task.blockedReason !== undefined && (
            <p className="mt-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-2xs text-rose-200 ring-1 ring-rose-500/40 ring-inset">
              “{task.blockedReason}”
            </p>
          )}

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs">
            {task.eta === undefined ? (
              <span className="text-ink-600">No ETA</span>
            ) : (
              <span className={late ? "font-semibold text-amber-300" : "text-ink-500"}>
                {formatDay(task.eta, today)}, {dueLabel(task.eta, today)}
              </span>
            )}
            {!assignable && responsibles.length === 0 && (
              <span className="rounded bg-rose-500 px-1 font-semibold text-rose-50">
                unassigned
              </span>
            )}
            {responsibles.length > 0 && (
              <span className="truncate text-ink-500">
                R {responsibles.map((person) => person.name).join(", ")}
              </span>
            )}
            {task.status !== "not_started" && (
              <span className={`rounded px-1 ${STATUSES[task.status].pill}`}>
                {STATUSES[task.status].label}
              </span>
            )}
          </p>
        </div>

        {assignable && (
          <div className="shrink-0 pt-0.5">
            <AssignButton task={task} people={people} />
          </div>
        )}
      </div>
    </li>
  );
}

// --- Loading --------------------------------------------------------------

/**
 * Built to the dashboard's own geometry — same header, same four tiles, same
 * strip and two columns — so the real numbers replace it without moving
 * anything. This is the first screen of the demo; it does not get to flicker.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton metaCount={4} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <Card>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-3 h-2.5 w-full" />
        </Card>
        {[0, 1].map((index) => (
          <Card key={index}>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="mt-3 h-2.5 w-40 max-w-full" />
          </Card>
        ))}
        <Card>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-2 h-2.5 w-36 max-w-full" />
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 md:grid-cols-4 xl:grid-cols-8">
        {ALL_PHASES.map((phase) => (
          <div key={phase} className="min-h-28 rounded-xl border border-ink-800 bg-ink-900/40 p-3">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="mt-2.5 h-2.5 w-3/4" />
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/60">
          <div className="border-b border-ink-800 px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="border-b border-ink-800/60 px-4 py-2.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="mt-1.5 h-2.5 w-1/2" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 xl:-order-1">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40"
            >
              <div className="flex items-center gap-3.5 px-4 py-3.5">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-1.5 h-3 w-28" />
                </div>
              </div>
              <div className="flex gap-1.5 border-y border-ink-800/70 px-4 py-3">
                {[0, 1, 2, 3].map((bar) => (
                  <Skeleton key={bar} className="h-4 flex-1 rounded-sm" />
                ))}
              </div>
              <div className="px-4 py-4">
                <Skeleton className="h-3.5 w-56 max-w-full" />
                <Skeleton className="mt-2 h-2.5 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-ink-800 bg-ink-900/60 p-4 ${className}`}>
      {children}
    </div>
  );
}
