import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhaseChecklist } from "../components/PhaseChecklist";
import { RollupChips, RollupTiles } from "../components/Rollup";
import { Breadcrumb, Loading, MetaItem, NotFound, PageHeader } from "../components/page";
import { InlineText } from "../components/inline";
import { EmptyState, Panel } from "../components/ui";
import { formatDay } from "../lib/dates";
import { SEASON_PHASES } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { href } from "../lib/router";
import { useReportedMutation } from "../lib/toast";

// Tier one: the planning year. Phase 0 is the company-wide work everything else
// is planned against, so the season page is also where the chain plans are
// listed and started.

type Tree = NonNullable<FunctionReturnType<typeof api.seasons.tree>>;

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

  if (data === undefined) return <Loading what="the season" />;
  if (data === null) return <NotFound what="season" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "Season" }]} />}
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
            <MetaItem label="Chain plans">
              {tree.chains.reduce((count, chain) => count + chain.plans.length, 0)}
            </MetaItem>
            <MetaItem label="Today">{formatDay(today)}</MetaItem>
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-slate-400">
          <InlineText
            value={data.season.notes}
            multiline
            placeholder="Add a note about this season…"
            onCommit={(notes) => void update({ seasonId, notes })}
          />
        </div>
      </PageHeader>

      <RollupTiles rollup={data.rollup} />

      {SEASON_PHASES.map((phase) => (
        <PhaseChecklist
          key={phase}
          phase={phase}
          owner={{ tier: "season", seasonId }}
          tasks={data.tasks}
          today={today}
          people={people}
          raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
          focusTaskId={focusTaskId}
        />
      ))}

      <Panel
        title="Chain plans"
        subtitle="Phases 1–4 live here. Start one from the sidebar for any chain without a plan."
      >
        {tree.chains.every((chain) => chain.plans.length === 0) ? (
          <EmptyState>No chain plans for this season yet.</EmptyState>
        ) : (
          <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-3">
            {tree.chains.flatMap((chain) =>
              chain.plans.map((node) => (
                <a
                  key={node.plan._id}
                  href={href({ name: "plan", chainPlanId: node.plan._id })}
                  className="group bg-slate-900 p-4 transition hover:bg-slate-800/70"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {chain.chain.name}
                    </h3>
                    <RollupChips rollup={node.rollup} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Currently phase {node.plan.currentPhase}
                    {node.plan.jbpDate !== undefined && ` · JBP ${formatDay(node.plan.jbpDate)}`}
                  </p>
                  <p className="mt-3 text-[11px] text-slate-500">
                    {node.promotions.length} promotion
                    {node.promotions.length === 1 ? "" : "s"}
                  </p>
                </a>
              )),
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
