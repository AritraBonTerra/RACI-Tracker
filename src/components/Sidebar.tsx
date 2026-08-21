import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { formatRange } from "../lib/dates";
import { PHASES } from "../lib/domain";
import { href, type Route } from "../lib/router";
import { useReportedMutation } from "../lib/toast";
import { RollupChips, mergeRollups, type Rollup } from "./Rollup";
import { Button, Skeleton } from "./ui";

// The navigation: the dashboard at the root, then the three tiers —
// Season -> Chain Plans -> Promotions — with each node carrying its own health,
// so the sidebar answers "where is the trouble?" before anything is clicked.
// The reference-data views hang off the bottom, which makes this the one
// complete map of the app: the mobile drawer renders exactly this.

type Tree = NonNullable<FunctionReturnType<typeof api.seasons.tree>>;

export function Sidebar({ tree, route }: { tree: Tree; route: Route }) {
  const createPlan = useReportedMutation(api.chainPlans.create);

  // The root node speaks for the whole season, so it adds up every node below it.
  const everything = mergeRollups([
    tree.seasonRollup,
    ...tree.chains.flatMap((chain) =>
      chain.plans.flatMap((plan) => [
        plan.rollup,
        ...plan.promotions.map((promotion) => promotion.rollup),
      ]),
    ),
  ]);

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <NodeLink
        to={{ name: "home" }}
        active={route.name === "home"}
        depth={0}
        label="Dashboard"
        meta="Everything that needs attention"
        rollup={everything}
      />

      <GroupLabel>Season</GroupLabel>

      <NodeLink
        to={{ name: "season", seasonId: tree.season._id }}
        active={route.name === "season"}
        depth={0}
        label={`Season ${tree.season.label}`}
        meta={`Phase 0 · ${PHASES[0].title}`}
        rollup={tree.seasonRollup}
      />

      <GroupLabel>Chain plans</GroupLabel>

      {tree.chains.map(({ chain, plans }) => (
        <div key={chain._id}>
          {plans.length === 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-lg py-1 pr-1 pl-2">
              <span className="min-w-0 truncate text-sm text-ink-500">{chain.name}</span>
              <Button
                size="xs"
                variant="ghost"
                title={`Start a ${chain.name} plan for ${tree.season.label}`}
                onClick={() =>
                  void createPlan({ seasonId: tree.season._id, chainId: chain._id })
                }
              >
                + Plan
              </Button>
            </div>
          ) : (
            plans.map((node) => (
              <div key={node.plan._id}>
                <NodeLink
                  to={{ name: "plan", chainPlanId: node.plan._id }}
                  active={route.name === "plan" && route.chainPlanId === node.plan._id}
                  depth={0}
                  label={chain.name}
                  meta={`Phase ${node.plan.currentPhase} · ${PHASES[node.plan.currentPhase].title}`}
                  rollup={node.rollup}
                />
                {node.promotions.map((promotion) => (
                  <NodeLink
                    key={promotion.promotion._id}
                    to={{ name: "promotion", promotionId: promotion.promotion._id }}
                    active={
                      route.name === "promotion" &&
                      route.promotionId === promotion.promotion._id
                    }
                    depth={1}
                    label={promotion.promotion.name}
                    meta={formatRange(
                      promotion.promotion.startDate,
                      promotion.promotion.endDate,
                    )}
                    rollup={promotion.rollup}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      ))}

      <GroupLabel>Reference</GroupLabel>
      <ReferenceLinks route={route} />
    </nav>
  );
}

/**
 * The nav with no season behind it — an empty database, or a season id that
 * outlived its season. Still every route that works without one, so an early
 * visit or a stale link is never a dead end.
 */
export function StaticNav({ route }: { route: Route }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <PlainLink
        to={{ name: "home" }}
        active={route.name === "home"}
        label="Dashboard"
        meta="Everything that needs attention"
      />
      <GroupLabel>Reference</GroupLabel>
      <ReferenceLinks route={route} />
    </nav>
  );
}

// Static class names, because Tailwind only ships the widths it can see in the
// source. The staggered widths read as a list of names rather than a table.
const NODE_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-1/2", "w-2/3", "w-1/2"];

/** Nav-shaped, so the tree landing does not shove the first click sideways. */
export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {NODE_WIDTHS.map((width, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="h-2 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ReferenceLinks({ route }: { route: Route }) {
  return (
    <>
      <PlainLink
        to={{ name: "people" }}
        active={route.name === "people"}
        label="People"
        meta="Who is loaded, and how much"
      />
      <PlainLink
        to={{ name: "manage" }}
        active={route.name === "manage"}
        label="Manage"
        meta="Chains, brands, people, seasons"
      />
    </>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 mb-1 px-2 text-3xs font-semibold tracking-wider text-ink-600 uppercase">
      {children}
    </p>
  );
}

const nodeClass = (active: boolean) =>
  `flex items-center justify-between gap-2 rounded-lg py-1.5 transition ${
    active
      ? "bg-ink-800 text-ink-50 ring-1 ring-ink-700 ring-inset"
      : "text-ink-300 hover:bg-ink-800/60"
  }`;

function NodeLink({
  to,
  active,
  depth,
  label,
  meta,
  rollup,
}: {
  to: Route;
  active: boolean;
  depth: number;
  label: string;
  meta: string;
  rollup: Rollup;
}) {
  return (
    <a
      href={href(to)}
      className={`${nodeClass(active)} pr-2 ${
        depth === 0 ? "pl-2" : "ml-3 border-l border-ink-800 pl-3"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium" title={label}>
          {label}
        </span>
        <span className="block truncate text-2xs text-ink-500">{meta}</span>
      </span>
      <RollupChips rollup={rollup} />
    </a>
  );
}

function PlainLink({
  to,
  active,
  label,
  meta,
}: {
  to: Route;
  active: boolean;
  label: string;
  meta: string;
}) {
  return (
    <a href={href(to)} className={`${nodeClass(active)} px-2`}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-2xs text-ink-500">{meta}</span>
      </span>
    </a>
  );
}
