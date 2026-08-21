import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Loading, NotFound, PageHeader } from "../components/page";
import { AssignButton } from "../components/RaciEditor";
import { EmptyState, Pill } from "../components/ui";
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
type AttentionItem = Dashboard["attention"]["unassigned"][number];

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

  if (data === undefined) return <Loading what="the dashboard" />;
  if (data === null) return <NotFound what="season" />;

  const promotionCount = data.chains.reduce(
    (count, group) => count + group.promotions.length,
    0,
  );
  const attention =
    data.rollup.unassigned + data.rollup.blocked + data.rollup.overdue;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <p className="text-[11px] tracking-wider text-slate-500 uppercase">
            Integrated Commercial Cycle
          </p>
        }
        title={`Season ${data.season.label}`}
        meta={
          <>
            <span className="text-slate-400">{formatDay(today)}</span>
            <span className="text-slate-600">·</span>
            <span>
              {data.chains.length} chain plan{data.chains.length === 1 ? "" : "s"}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {promotionCount} promotion{promotionCount === 1 ? "" : "s"}
            </span>
            <span className="text-slate-600">·</span>
            <span>{data.rollup.total} tasks on the checklists</span>
          </>
        }
      />

      <Headline rollup={data.rollup} attention={attention} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <SeasonCard data={data} />
          {data.chains.map((group) => (
            <ChainSection key={group.plan._id} group={group} today={today} />
          ))}
        </div>

        <NeedsAttention attention={data.attention} today={today} people={people} />
      </div>
    </div>
  );
}

/** The numbers that decide whether anyone needs to do something today. */
function Headline({
  rollup,
  attention,
}: {
  rollup: Dashboard["rollup"];
  attention: number;
}) {
  const progress =
    rollup.total === 0 ? 0 : Math.round((rollup.delivered / rollup.total) * 100);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* Unassigned is the state the tool exists to surface, so it is twice the
          size of everything else and the only card with a solid red edge. */}
      <div
        className={`relative overflow-hidden rounded-xl border p-4 sm:col-span-2 xl:col-span-1 ${
          rollup.unassigned > 0
            ? "border-rose-500/70 bg-rose-500/10"
            : "border-slate-800 bg-slate-900/60"
        }`}
      >
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${
            rollup.unassigned > 0 ? "bg-rose-500" : "bg-slate-700"
          }`}
        />
        <p className="flex items-baseline gap-2">
          <span
            className={`text-5xl leading-none font-bold tabular-nums ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-slate-600"
            }`}
          >
            {rollup.unassigned}
          </span>
          <span
            className={`text-sm font-semibold tracking-wide uppercase ${
              rollup.unassigned > 0 ? "text-rose-300" : "text-slate-600"
            }`}
          >
            Unassigned
          </span>
        </p>
        <p className="mt-1.5 text-[11px] text-slate-400">
          No named Responsible. A function default is not a person.
        </p>
      </div>

      <Stat
        value={rollup.overdue}
        label="Overdue"
        tone="text-amber-300"
        note="Past ETA and not delivered."
      />
      <Stat
        value={rollup.blocked}
        label="Blocked"
        tone="text-rose-300"
        note="Stopped, with a stated reason."
      />

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl leading-none font-semibold text-emerald-300 tabular-nums">
            {rollup.delivered}
          </span>
          <span className="text-sm text-slate-500 tabular-nums">
            / {rollup.total} delivered
          </span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {attention} item{attention === 1 ? "" : "s"} need attention
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
}: {
  value: number;
  label: string;
  tone: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="flex items-baseline gap-2">
        <span
          className={`text-3xl leading-none font-semibold tabular-nums ${
            value === 0 ? "text-slate-600" : tone
          }`}
        >
          {value}
        </span>
        <span
          className={`text-sm font-semibold tracking-wide uppercase ${
            value === 0 ? "text-slate-600" : tone
          }`}
        >
          {label}
        </span>
      </p>
      <p className="mt-1.5 text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

/** Phase 0 is the company-wide work every plan below is planned against. */
function SeasonCard({ data }: { data: Dashboard }) {
  return (
    <a
      href={href({ name: "season", seasonId: data.season._id })}
      className="block rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 transition hover:border-slate-700 hover:bg-slate-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold text-slate-100">
          Season {data.season.label}
          <span className="ml-2 text-xs font-normal text-slate-500">
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
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
      <header className="border-b border-slate-800 bg-slate-900/70 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="flex items-baseline gap-2">
            <a
              href={href({ name: "plan", chainPlanId: group.plan._id })}
              className="text-base font-semibold tracking-tight text-slate-50 hover:text-white"
            >
              {group.chain?.name ?? "Chain"}
            </a>
            <span className="text-[11px] text-slate-500">
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
        <EmptyState>
          No promotions yet — this plan is still working towards an agreement.
        </EmptyState>
      ) : (
        // A lone promotion takes the full width rather than leaving an empty cell.
        <div
          className={`grid gap-px bg-slate-800/70 ${
            group.promotions.length > 1 ? "md:grid-cols-2" : ""
          }`}
        >
          {group.promotions.map((node) => (
            <a
              key={node.promotion._id}
              href={href({ name: "promotion", promotionId: node.promotion._id })}
              className="bg-slate-900/60 px-4 py-3 transition hover:bg-slate-800/60"
            >
              <h3 className="text-sm font-semibold text-slate-100">
                {node.promotion.name}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
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
        const done = stat.total === 0 ? 0 : Math.round((stat.delivered / stat.total) * 100);
        const tone =
          stat.total === 0
            ? "text-slate-600"
            : stat.unassigned > 0
              ? "text-rose-300"
              : stat.blocked > 0
                ? "text-rose-300"
                : stat.overdue > 0
                  ? "text-amber-300"
                  : stat.delivered === stat.total
                    ? "text-emerald-300"
                    : "text-slate-400";

        return (
          <div
            key={stat.phase}
            className="min-w-0 flex-1"
            title={phaseTitle(stat)}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className={`font-mono text-[10px] font-semibold ${tone}`}>
                {stat.phase}
              </span>
              <span className="text-[10px] text-slate-600 tabular-nums">
                {stat.total === 0 ? "—" : `${stat.delivered}/${stat.total}`}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-slate-800">
              <div
                className={`h-full ${
                  stat.blocked > 0 ? "bg-emerald-600" : "bg-emerald-500"
                }`}
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
    <span className="flex shrink-0 flex-wrap items-center gap-1 text-[10px] font-semibold tabular-nums">
      {rollup.unassigned > 0 && (
        <Pill className="bg-rose-500 text-rose-50">
          {rollup.unassigned} unassigned
        </Pill>
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
      <span className="pl-0.5 text-[10px] font-normal text-slate-500">
        {rollup.delivered}/{rollup.total}
      </span>
    </span>
  );
}

// --- The rail -------------------------------------------------------------

const PREVIEW = 5;

function NeedsAttention({
  attention,
  today,
  people,
}: {
  attention: Dashboard["attention"];
  today: string;
  people: PeopleDirectory;
}) {
  const total =
    attention.unassigned.length + attention.blocked.length + attention.overdue.length;

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <header className="flex items-baseline justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">
          Needs attention
        </h2>
        <span className="text-[11px] text-slate-500 tabular-nums">{total} items</span>
      </header>

      <Section
        title="Unassigned"
        note="nobody is doing this"
        items={attention.unassigned}
        tone="danger"
        today={today}
        people={people}
        assignable
      />
      <Section
        title="Blocked"
        note="stopped, and why"
        items={attention.blocked}
        tone="danger"
        today={today}
        people={people}
      />
      <Section
        title="Overdue"
        note="past ETA, still open"
        items={attention.overdue}
        tone="warning"
        today={today}
        people={people}
      />

      {total === 0 && (
        <EmptyState>
          Nothing unowned, blocked or late. Every task has a name on it.
        </EmptyState>
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
    <section className="border-b border-slate-800 last:border-b-0">
      <header
        className={`flex items-baseline justify-between gap-2 px-4 py-2 ${
          tone === "danger" ? "bg-rose-500/10" : "bg-amber-500/10"
        }`}
      >
        <h3
          className={`flex items-baseline gap-2 text-[11px] font-semibold tracking-wider uppercase ${
            tone === "danger" ? "text-rose-300" : "text-amber-300"
          }`}
        >
          {title}
          <span className="text-[10px] font-normal tracking-normal text-slate-500 normal-case">
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
          className="w-full px-4 py-1.5 text-left text-[11px] text-slate-500 transition hover:bg-slate-800/60 hover:text-slate-300"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
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
    <li className="relative border-b border-slate-800/60 last:border-b-0">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${
          tone === "danger" ? "bg-rose-500" : "bg-amber-400"
        }`}
      />
      <div className="flex items-start gap-2 py-2 pr-3 pl-4 transition hover:bg-slate-800/40">
        <div className="min-w-0 flex-1">
          {/* Deep link: the task's own row, opened and scrolled to. */}
          <a
            href={href(placeRoute(place, task._id))}
            className="block truncate text-xs font-medium text-slate-100 hover:text-white hover:underline"
            title={task.spec ?? task.name}
          >
            {task.name}
          </a>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {place.chain !== null && place.tier !== "chainPlan" && `${place.chain} · `}
            {place.label} · phase {task.phase}
          </p>

          {task.status === "blocked" && task.blockedReason !== undefined && (
            <p className="mt-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] text-rose-200 ring-1 ring-rose-500/40 ring-inset">
              “{task.blockedReason}”
            </p>
          )}

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
            {task.eta === undefined ? (
              <span className="text-slate-600">No ETA</span>
            ) : (
              <span className={late ? "font-semibold text-amber-300" : "text-slate-500"}>
                {formatDay(task.eta, today)} · {dueLabel(task.eta, today)}
              </span>
            )}
            {!assignable && task.responsiblePersonId === undefined && (
              <span className="rounded bg-rose-500 px-1 font-semibold text-rose-50">
                unassigned
              </span>
            )}
            {responsible !== undefined && (
              <span className="truncate text-slate-500">R {responsible.name}</span>
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
