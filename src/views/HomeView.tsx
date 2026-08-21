import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  cardClass,
  cardGrid,
  HeaderSkeleton,
  NotFound,
  PageHeader,
} from "../components/page";
import { AssignButton } from "../components/RaciEditor";
import { EmptyState, Pill, Skeleton } from "../components/ui";
import { dueLabel, formatDay, formatRange, isOverdue } from "../lib/dates";
import { PHASES, STATUSES } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { href, placeRoute } from "../lib/router";

// The dashboard. Everything Emmanuel asked to see on one screen: every promotion
// grouped by chain with how far through its phases it is, and — louder than
// anything else — the work nobody owns, the work that is stuck, and the work
// that is late. If this screen is calm, the cycle is under control.

type Dashboard = NonNullable<FunctionReturnType<typeof api.home.dashboard>>;
type ChainGroup = Dashboard["chains"][number];
type PhaseStat = ChainGroup["phases"][number];
type Attention = Dashboard["attention"];
type AttentionItem = Attention["unassigned"][number];

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

  if (data === undefined) return <DashboardSkeleton />;
  if (data === null) return <NotFound what="season" />;

  const promotionCount = data.chains.reduce(
    (count, group) => count + group.promotions.length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <p className="text-2xs tracking-wider text-ink-500 uppercase">
            Integrated Commercial Cycle
          </p>
        }
        title={`Season ${data.season.label}`}
        meta={
          <>
            <span className="text-ink-300">{formatDay(today)}</span>
            <Dot />
            <span>
              {data.chains.length} chain plan{data.chains.length === 1 ? "" : "s"}
            </span>
            <Dot />
            <span>
              {promotionCount} promotion{promotionCount === 1 ? "" : "s"}
            </span>
            <Dot />
            <span>{data.rollup.total} tasks on the checklists</span>
          </>
        }
      />

      <Headline rollup={data.rollup} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Stacked on a phone the rail is the point of the screen, so it comes
            first; side by side it belongs on the right. */}
        <NeedsAttention attention={data.attention} today={today} people={people} />

        <div className="flex flex-col gap-5 xl:-order-1">
          <SeasonCard data={data} />
          {data.chains.map((group) => (
            <ChainSection key={group.plan._id} group={group} today={today} />
          ))}
          {data.chains.length === 0 && (
            <section className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
              <EmptyState title="No chain plans in this season yet">
                A chain plan is one account for one year — Safeway 2026, Kroger 2026.
                Start one from the chain list in the sidebar and phases 1–4 appear
                underneath it.
              </EmptyState>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-700">
      ·
    </span>
  );
}

/** The numbers that decide whether anyone needs to do something today. */
function Headline({ rollup }: { rollup: Dashboard["rollup"] }) {
  const progress =
    rollup.total === 0 ? 0 : Math.round((rollup.delivered / rollup.total) * 100);
  const attention = rollup.unassigned + rollup.blocked + rollup.overdue;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Unassigned is the state the tool exists to surface, so it is twice the
          size of everything else and the only card with a solid red edge. */}
      <div
        className={`relative overflow-hidden rounded-xl border p-4 sm:col-span-2 xl:col-span-1 ${
          rollup.unassigned > 0
            ? "border-rose-500/70 bg-rose-500/10"
            : "border-ink-800 bg-ink-900/60"
        }`}
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${
            rollup.unassigned > 0 ? "bg-rose-500" : "bg-emerald-500/60"
          }`}
        />
        <p className="flex items-baseline gap-2">
          <span
            className={`text-5xl leading-none font-bold tabular-nums ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-ink-600"
            }`}
          >
            {rollup.unassigned}
          </span>
          <span
            className={`text-sm font-semibold tracking-wide uppercase ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-ink-500"
            }`}
          >
            Unassigned
          </span>
        </p>
        <p className="mt-1.5 text-2xs text-ink-400">
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
          <span className="text-3xl leading-none font-semibold text-emerald-300 tabular-nums">
            {rollup.delivered}
          </span>
          <span className="text-sm text-ink-500 tabular-nums">
            / {rollup.total} delivered
          </span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-2xs text-ink-500">
          {attention === 0
            ? "Nothing needs attention right now."
            : `${attention} item${attention === 1 ? "" : "s"} need attention`}
          {rollup.missingAccountable > 0 &&
            ` · ${rollup.missingAccountable} with no named Accountable`}
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
          className={`text-3xl leading-none font-semibold tabular-nums ${
            value === 0 ? "text-ink-600" : tone
          }`}
        >
          {value}
        </span>
        <span
          className={`text-sm font-semibold tracking-wide uppercase ${
            value === 0 ? "text-ink-500" : tone
          }`}
        >
          {label}
        </span>
      </p>
      <p className="mt-1.5 text-2xs text-ink-400">{value === 0 ? zeroNote : note}</p>
    </div>
  );
}

/** Phase 0 is the company-wide work every plan below is planned against. */
function SeasonCard({ data }: { data: Dashboard }) {
  return (
    <a
      href={href({ name: "season", seasonId: data.season._id })}
      className="block rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-3 transition hover:border-ink-700 hover:bg-ink-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-ink-100">
          Season {data.season.label}
          <span className="ml-2 text-xs font-normal text-ink-500">
            Phase 0 · {PHASES[0].title}
          </span>
        </h2>
        <AttentionChips rollup={data.seasonRollup} />
      </div>
      {/* One phase, so the track is held to a width that still reads as a bar. */}
      <div className="mt-2.5 max-w-xs">
        <PhaseTrack phases={data.seasonPhases} />
      </div>
    </a>
  );
}

/** One chain: its plan (phases 1–4) and every promotion under it (5–8). */
function ChainSection({ group, today }: { group: ChainGroup; today: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
      <header className="border-b border-ink-800 bg-ink-900/70 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="flex flex-wrap items-baseline gap-x-2">
            <a
              href={href({ name: "plan", chainPlanId: group.plan._id })}
              className="text-base font-semibold tracking-tight text-ink-50 transition hover:underline"
            >
              {group.chain?.name ?? "Chain"}
            </a>
            <span className="text-2xs text-ink-500">
              phase {group.plan.currentPhase} · {PHASES[group.plan.currentPhase].title}
              {group.plan.jbpDate !== undefined &&
                ` · JBP ${formatDay(group.plan.jbpDate, today)}`}
            </span>
          </h2>
          <AttentionChips rollup={group.rollup} />
        </div>
        <div className="mt-2.5">
          <PhaseTrack phases={group.phases} />
        </div>
      </header>

      {group.promotions.length === 0 ? (
        <EmptyState title="No promotions yet">
          Phases 5–8 belong to a promotion, and this plan does not have one — it is still
          working towards an agreement. Open the plan to add the first program.
        </EmptyState>
      ) : (
        <div className={cardGrid(group.promotions.length)}>
          {group.promotions.map((node) => (
            <a
              key={node.promotion._id}
              href={href({ name: "promotion", promotionId: node.promotion._id })}
              className={cardClass}
            >
              <h3 className="text-sm font-semibold text-ink-100">
                {node.promotion.name}
              </h3>
              <p className="mt-0.5 text-2xs text-ink-500">
                {formatRange(node.promotion.startDate, node.promotion.endDate)}
                {node.promotion.storeCount !== undefined &&
                  ` · ${node.promotion.storeCount} stores`}
                {` · phase ${node.promotion.currentPhase} ${PHASES[node.promotion.currentPhase].title}`}
              </p>
              <div className="mt-1.5">
                <AttentionChips rollup={node.rollup} />
              </div>
              <div className="mt-2.5">
                <PhaseTrack phases={node.phases} />
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A tier's phases as a progress track: how much of each phase is delivered, and
 * a phase number that turns the colour of the worst thing in it.
 */
function PhaseTrack({ phases }: { phases: readonly PhaseStat[] }) {
  return (
    <div className="flex items-end gap-1.5">
      {phases.map((stat) => {
        const done =
          stat.total === 0 ? 0 : Math.round((stat.delivered / stat.total) * 100);
        const tone =
          stat.total === 0
            ? "text-ink-600"
            : stat.unassigned > 0 || stat.blocked > 0
              ? "text-rose-300"
              : stat.overdue > 0
                ? "text-amber-300"
                : stat.delivered === stat.total
                  ? "text-emerald-300"
                  : "text-ink-400";

        return (
          <div key={stat.phase} className="min-w-0 flex-1" title={phaseTitle(stat)}>
            <div className="flex items-baseline justify-between gap-1">
              <span className={`font-mono text-3xs font-semibold ${tone}`}>
                {stat.phase}
              </span>
              <span className="text-3xs text-ink-600 tabular-nums">
                {stat.total === 0 ? "—" : `${stat.delivered}/${stat.total}`}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-ink-800">
              <div
                className={`h-full ${stat.blocked > 0 ? "bg-emerald-600" : "bg-emerald-500"}`}
                style={{ width: `${done}%` }}
              />
            </div>
            {/* A phase with unowned work gets a red underline, so a wall of
                promotions still reads at a glance. */}
            <div
              className={`mt-0.5 h-0.5 rounded-sm ${
                stat.unassigned > 0 ? "bg-rose-500" : "bg-transparent"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

function phaseTitle(stat: PhaseStat): string {
  const parts = [`Phase ${stat.phase} · ${PHASES[stat.phase].title}`];
  if (stat.total === 0) parts.push("nothing on this checklist");
  else parts.push(`${stat.delivered}/${stat.total} delivered`);
  if (stat.unassigned > 0) parts.push(`${stat.unassigned} unassigned`);
  if (stat.blocked > 0) parts.push(`${stat.blocked} blocked`);
  if (stat.overdue > 0) parts.push(`${stat.overdue} overdue`);
  return parts.join(" — ");
}

function AttentionChips({ rollup }: { rollup: Dashboard["rollup"] }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1 text-3xs font-semibold tabular-nums">
      {rollup.unassigned > 0 && (
        <Pill className="bg-rose-500 text-rose-50">{rollup.unassigned} unassigned</Pill>
      )}
      {rollup.blocked > 0 && (
        <Pill className="bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/60 ring-inset">
          {rollup.blocked} blocked
        </Pill>
      )}
      {rollup.overdue > 0 && (
        <Pill className="bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 ring-inset">
          {rollup.overdue} late
        </Pill>
      )}
      <span className="pl-0.5 text-3xs font-normal text-ink-500">
        {rollup.delivered}/{rollup.total}
      </span>
    </span>
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
}: {
  attention: Attention;
  today: string;
  people: PeopleDirectory;
}) {
  const total = RAIL_SECTIONS.reduce(
    (count, section) => count + attention[section.key].length,
    0,
  );
  const cleared = RAIL_SECTIONS.filter((section) => attention[section.key].length === 0);

  return (
    <aside className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60">
      <header className="flex items-baseline justify-between gap-3 border-b border-ink-800 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-ink-100">
          Needs attention
        </h2>
        <span className="text-2xs text-ink-500 tabular-nums">
          {total === 0 ? "all clear" : `${total} item${total === 1 ? "" : "s"}`}
        </span>
      </header>

      {total === 0 ? (
        <EmptyState tone="good" title="Nothing needs attention">
          Every task has a named Responsible, nothing is blocked, and nothing is past its
          ETA. This is what the season is supposed to look like.
        </EmptyState>
      ) : (
        <>
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
            />
          ))}

          {/* The categories that are already clear still get a line, because
              "no blocked work" is news worth reading on this rail. */}
          {cleared.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-ink-800 px-4 py-2 text-2xs text-ink-500">
              <span aria-hidden className="text-emerald-400">
                ✓
              </span>
              {cleared.map((section, index) => (
                <span key={section.key}>
                  {index > 0 && <span className="pr-2 text-ink-700">·</span>}
                  {section.clear}
                </span>
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
}: {
  title: string;
  note: string;
  items: readonly AttentionItem[];
  tone: "danger" | "warning";
  today: string;
  people: PeopleDirectory;
  assignable?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  if (items.length === 0) return null;

  const shown = showAll ? items : items.slice(0, PREVIEW);

  return (
    <section className="border-b border-ink-800 last:border-b-0">
      <header
        className={`flex items-baseline justify-between gap-2 px-4 py-2 ${
          tone === "danger" ? "bg-rose-500/10" : "bg-amber-500/10"
        }`}
      >
        <h3
          className={`flex flex-wrap items-baseline gap-x-2 text-2xs font-semibold tracking-wider uppercase ${
            tone === "danger" ? "text-rose-300" : "text-amber-300"
          }`}
        >
          {title}
          <span className="text-3xs font-normal tracking-normal text-ink-500 normal-case">
            {note}
          </span>
        </h3>
        <span
          className={`text-sm font-bold tabular-nums ${
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
            tone={tone}
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
          {showAll
            ? `Show the first ${PREVIEW}`
            : `Show the other ${items.length - PREVIEW}`}
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
  tone,
  today,
  people,
  assignable,
}: {
  item: AttentionItem;
  tone: "danger" | "warning";
  today: string;
  people: PeopleDirectory;
  assignable: boolean;
}) {
  const { task, place } = item;
  const late = isOverdue(task.eta, task.status, today);
  const responsible =
    task.responsiblePersonId === undefined
      ? undefined
      : people.byId.get(task.responsiblePersonId);

  return (
    <li className="relative border-b border-ink-800/60 last:border-b-0">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${
          tone === "danger" ? "bg-rose-500" : "bg-amber-400"
        }`}
      />
      <div className="flex items-start gap-2 py-2 pr-3 pl-4 transition hover:bg-ink-800/40">
        <div className="min-w-0 flex-1">
          {/* Deep link: the task's own row, opened and scrolled to. */}
          <a
            href={href(placeRoute(place, task._id))}
            className="block truncate text-xs font-medium text-ink-100 hover:underline"
            title={task.spec ?? task.name}
          >
            {task.name}
          </a>
          <p className="mt-0.5 truncate text-3xs text-ink-500">
            {place.chain !== null && place.tier !== "chainPlan" && `${place.chain} · `}
            {place.label} · phase {task.phase}
          </p>

          {task.status === "blocked" && task.blockedReason !== undefined && (
            <p className="mt-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-2xs text-rose-200 ring-1 ring-rose-500/40 ring-inset">
              “{task.blockedReason}”
            </p>
          )}

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs">
            {task.eta === undefined ? (
              <span className="text-ink-600">No ETA</span>
            ) : (
              <span className={late ? "font-semibold text-amber-300" : "text-ink-500"}>
                {formatDay(task.eta, today)} · {dueLabel(task.eta, today)}
              </span>
            )}
            {!assignable && task.responsiblePersonId === undefined && (
              <span className="rounded bg-rose-500 px-1 font-semibold text-rose-50">
                unassigned
              </span>
            )}
            {responsible !== undefined && (
              <span className="truncate text-ink-500">R {responsible.name}</span>
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
 * two columns — so the real numbers replace it without moving anything. This is
 * the first screen of the demo; it does not get to flicker.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton metaCount={4} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2 xl:col-span-1">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="mt-2.5 h-2.5 w-full" />
        </Card>
        {[0, 1].map((index) => (
          <Card key={index}>
            <Skeleton className="h-8 w-28" />
            <Skeleton className="mt-2.5 h-2.5 w-40 max-w-full" />
          </Card>
        ))}
        <Card>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-2 h-2.5 w-36 max-w-full" />
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60">
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

        <div className="flex flex-col gap-5 xl:-order-1">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40"
            >
              <div className="border-b border-ink-800 bg-ink-900/70 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <div className="mt-3 flex gap-1.5">
                  {[0, 1, 2, 3].map((bar) => (
                    <Skeleton key={bar} className="h-4 flex-1 rounded-sm" />
                  ))}
                </div>
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
