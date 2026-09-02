import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { InlineText } from "../components/inline";
import { Pathway } from "../components/Pathway";
import { PhaseChecklist } from "../components/PhaseChecklist";
import {
  Breadcrumb,
  cardClass,
  cardGrid,
  LastEdited,
  MetaItem,
  NotFound,
  PageHeader,
  TierSkeleton,
} from "../components/page";
import { RollupChips, RollupTiles } from "../components/Rollup";
import { EmptyState, Panel } from "../components/ui";
import { formatDay } from "../lib/dates";
import { CHAIN_PLAN_PHASES, PHASES, SEASON_PHASES } from "../lib/domain";
import { buildPathway } from "../lib/pathway";
import type { PeopleDirectory } from "../lib/people";
import { href } from "../lib/router";
import { useReportedMutation } from "../lib/toast";

// Tier one: the planning year. Phase 0 is the company-wide work everything else
// is planned against, so the season page is also where the chain plans are
// listed and started.

type Tree = NonNullable<FunctionReturnType<typeof api.seasons.tree>>;
type PlanNode = Tree["chains"][number]["plans"][number];
/** A chain plan this viewer can open, with the chain name to title it. */
type PlanCard = { chainName: string; node: Extract<PlanNode, { reach: "full" }> };

export function SeasonView({
  seasonId,
  today,
  people,
  tree,
  focusTaskId,
}: {
  seasonId: Id<"seasons">;
  today: string;
  people: PeopleDirectory;
  tree: Tree;
  focusTaskId?: Id<"tasks">;
}) {
  const data = useQuery(api.seasons.overview, { seasonId, today });
  const update = useReportedMutation(api.seasons.update);

  if (data === undefined) return <TierSkeleton panels={2} />;
  if (data === null) return <NotFound />;

  // Only plans the viewer can open are cards on this page. A chain plan reached
  // as context has no phases to show and no page to link to, so it is not one.
  const planCards = tree.chains.flatMap((chain) =>
    chain.plans.flatMap((node) =>
      node.reach === "full" ? [{ chainName: chain.chain.name, node }] : [],
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "Plan year" }]} />}
        title={
          <InlineText
            value={data.season.label}
            onCommit={(label) => void update({ seasonId, label })}
            className="text-2xl font-semibold tracking-tight"
          />
        }
        meta={
          <>
            <MetaItem label="Year">{data.season.year}</MetaItem>
            <MetaItem label="Chain plans">{planCards.length}</MetaItem>
            <MetaItem label="Today">{formatDay(today)}</MetaItem>
            <LastEdited record={data.season} editors={data.editors} />
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-ink-400">
          <InlineText
            value={data.season.notes}
            multiline
            placeholder="Add a note about this year…"
            onCommit={(notes) => void update({ seasonId, notes })}
          />
        </div>
      </PageHeader>

      <Pathway phases={buildPathway(SEASON_PHASES, data.tasks, {}, 0, today)} today={today}>
        {planCards.length > 0 && <ChainPositions plans={planCards} today={today} />}
      </Pathway>

      <RollupTiles rollup={data.rollup} />

      {SEASON_PHASES.map((phase) => (
        <PhaseChecklist
          key={phase}
          phase={phase}
          owner={{ tier: "season", seasonId }}
          tasks={data.tasks}
          today={today}
          people={people}
          editors={data.editors}
          raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
          focusTaskId={focusTaskId}
        />
      ))}

      <Panel
        title="Chain plans"
        subtitle="Phases 1–4 live here. Start one from the sidebar for any chain without a plan."
      >
        {planCards.length === 0 ? (
          <EmptyState title="No chain plans for this year yet">
            One plan per retail account per year. Every chain in Manage is listed in the sidebar
            with a <span className="text-ink-300">+ Plan</span> button beside it — starting one lays
            down the phase 1–4 checklist.
          </EmptyState>
        ) : (
          <div className={cardGrid(planCards.length)}>
            {planCards.map(({ chainName, node }) => (
              <a
                key={node.chainPlanId}
                href={href({ name: "plan", chainPlanId: node.chainPlanId })}
                className={cardClass}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-100">{chainName}</h3>
                  <RollupChips rollup={node.rollup} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Currently phase {node.plan.currentPhase}
                  {node.plan.jbpDate !== undefined &&
                    ` · JBP ${formatDay(node.plan.jbpDate, today)}`}
                </p>
                <p className="mt-3 text-2xs text-ink-500">
                  {node.promotions.length} promotion
                  {node.promotions.length === 1 ? "" : "s"}
                </p>
              </a>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// Where every chain sits on phases 1-4, so the year view answers "what's
// where" without a single click (CONTEXT.md: Pathway).
function ChainPositions({ plans, today }: { plans: readonly PlanCard[]; today: string }) {
  return (
    <div className="mt-3 grid gap-1.5 border-t border-ink-800 pt-3">
      {plans.map(({ chainName, node }) => (
        <a
          key={node.chainPlanId}
          href={href({ name: "plan", chainPlanId: node.chainPlanId })}
          className="flex items-center gap-3 rounded-md px-1 py-0.5 text-xs hover:bg-ink-800/60"
        >
          <span className="w-24 shrink-0 truncate text-ink-200">{chainName}</span>
          <span className="flex items-center gap-1">
            {CHAIN_PLAN_PHASES.map((phase) => {
              const done = phase < node.plan.currentPhase;
              const current = phase === node.plan.currentPhase;
              return (
                <span
                  key={phase}
                  className={`flex size-4 items-center justify-center rounded text-3xs ${
                    done
                      ? "bg-emerald-500 font-bold text-ink-fixed"
                      : current
                        ? "bg-ink-800 text-ink-100 ring-1 ring-sand-500"
                        : "bg-ink-800 text-ink-500"
                  }`}
                >
                  {done ? "✓" : phase}
                </span>
              );
            })}
          </span>
          <span className="truncate text-2xs text-ink-500">
            phase {node.plan.currentPhase} · {PHASES[node.plan.currentPhase].title}
            {node.plan.jbpDate !== undefined && ` · JBP ${formatDay(node.plan.jbpDate, today)}`}
            {` · ${node.promotions.length} promotion${node.promotions.length === 1 ? "" : "s"}`}
          </span>
        </a>
      ))}
    </div>
  );
}
