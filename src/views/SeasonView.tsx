import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCanEditWork, useIsAdministrator } from "../components/AuthGate";
import { InlineText } from "../components/inline";
import { NewChainPlanModal } from "../components/NewChainPlanModal";
import { Pathway } from "../components/Pathway";
import { PhaseBadge, PhaseTitle, phaseStyle } from "../components/Phase";
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
import { Button, EmptyState, Panel } from "../components/ui";
import { formatDay } from "../lib/dates";
import { CHAIN_PLAN_PHASES, SEASON_PHASES } from "../lib/domain";
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
  // Starting a chain plan follows the sidebar (ADR 0004): anyone who can edit
  // this year may start one, and the tree already lists which chains are open
  // to them. Naming a brand-new chain stays an Administrator's move. The modal
  // here is the sidebar's, so both doors open the same room.
  const isAdministrator = useIsAdministrator();
  const canEdit = useCanEditWork();
  const [creating, setCreating] = useState(false);

  if (data === undefined) return <TierSkeleton panels={2} />;
  if (data === null) return <NotFound />;

  // Only plans the viewer can open are cards on this page. A chain plan reached
  // as context has no phases to show and no page to link to, so it is not one.
  const planCards = tree.chains.flatMap((chain) =>
    chain.plans.flatMap((node) =>
      node.reach === "full" ? [{ chainName: chain.chain.name, node }] : [],
    ),
  );
  const planless = tree.chains.filter((chain) => chain.plans.length === 0).map((c) => c.chain);
  const canStartPlan = isAdministrator || (canEdit && planless.length > 0);

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
        actions={
          isAdministrator ? (
            <Button variant="primary" size="md" onClick={() => setCreating(true)}>
              + Chain plan
            </Button>
          ) : undefined
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
        subtitle="One per retail account. Phases 1–3 live here."
        actions={
          canStartPlan ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              + Chain plan
            </Button>
          ) : undefined
        }
      >
        {planCards.length === 0 ? (
          <EmptyState
            title="No chain plans for this year yet"
            action={
              canStartPlan ? (
                <Button variant="primary" size="md" onClick={() => setCreating(true)}>
                  + Chain plan
                </Button>
              ) : undefined
            }
          >
            One plan per retail account per year — Safeway 2026, Kroger 2026. Starting one lays down
            the phase 1–3 checklist.
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
                <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                  <PhaseBadge phase={node.plan.currentPhase} size="xs" />
                  <PhaseTitle phase={node.plan.currentPhase} />
                  {node.plan.jbpDate !== undefined && (
                    <span className="text-ink-500">JBP {formatDay(node.plan.jbpDate, today)}</span>
                  )}
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

      {canStartPlan && creating && (
        <NewChainPlanModal
          seasonId={seasonId}
          seasonLabel={data.season.label}
          planless={planless}
          allowNewChain={isAdministrator}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// Where every chain sits on phases 1-3, so the year view answers "what's
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
                      ? "bg-emerald-500 font-bold text-white"
                      : current
                        ? "bg-(--phase) font-bold text-white"
                        : "bg-ink-800 text-ink-500"
                  }`}
                  style={phaseStyle(phase)}
                >
                  {done ? "✓" : phase}
                </span>
              );
            })}
          </span>
          <span className="truncate text-2xs text-ink-500">
            <PhaseTitle phase={node.plan.currentPhase} />
            {node.plan.jbpDate !== undefined && `, JBP ${formatDay(node.plan.jbpDate, today)}`}
            {`, ${node.promotions.length} promotion${node.promotions.length === 1 ? "" : "s"}`}
          </span>
        </a>
      ))}
    </div>
  );
}
