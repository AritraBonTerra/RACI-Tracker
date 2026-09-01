import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatRange } from "../lib/dates";
import { PHASES } from "../lib/domain";
import { href, navigate, type Route } from "../lib/router";
import { useReportedMutation } from "../lib/toast";
import { NewChainPlanModal } from "./NewChainPlanModal";
import { mergeRollups, type Rollup, RollupChips } from "./Rollup";
import { Button, Skeleton } from "./ui";

// The navigation: the dashboard at the root, then the three tiers —
// Plan Year -> Chain Plans -> Promotions — with each node carrying its own
// health, so the sidebar answers "where is the trouble?" before anything is
// clicked. Branches fold: the year folds its plans, a plan folds its
// promotions, and a collapsed node wears the merged chips of everything inside
// it, so closing a branch can never hide a fire. Collapse state lives in
// localStorage; the branch holding the current page always renders open.
//
// The reference-data views hang off the bottom, which makes this the one
// complete map of the app: the mobile drawer renders exactly this.

type Tree = NonNullable<FunctionReturnType<typeof api.seasons.tree>>;
type ChainNode = Tree["chains"][number];
type PlanNode = ChainNode["plans"][number];

const COLLAPSE_KEY = "raci.sidebar.collapsed";

function loadCollapsed(): ReadonlySet<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function Sidebar({
  tree,
  route,
  today,
  activePlanId,
}: {
  tree: Tree;
  route: Route;
  today: string;
  /** The plan the current page lives under, resolved by the shell from the route. */
  activePlanId?: Id<"chainPlans">;
}) {
  const createPlan = useReportedMutation(api.chainPlans.create);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [creating, setCreating] = useState(false);

  // Persisted as an effect, not inside the updater, which React may run twice.
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The branch holding the current page always renders open, whatever its
  // chevron says — navigation never lands inside a hidden node.
  const yearOpen =
    !collapsed.has(tree.season._id) || route.name === "season" || activePlanId !== undefined;

  // The root node speaks for the whole year, so it adds up every node below it.
  const everything = mergeRollups([
    tree.seasonRollup,
    ...tree.chains.flatMap((chain) =>
      chain.plans.flatMap((plan) => [
        plan.rollup,
        ...plan.promotions.map((promotion) => promotion.rollup),
      ]),
    ),
  ]);

  const planless = tree.chains.filter((chain) => chain.plans.length === 0);

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <TreeRow>
        <NodeLink
          // Named year, so Dashboard stays on the year you are looking at.
          to={{ name: "home", seasonId: tree.season._id }}
          active={route.name === "home"}
          label="Dashboard"
          meta="Everything that needs attention"
          rollup={everything}
        />
      </TreeRow>

      <GroupLabel>Plan year</GroupLabel>

      <TreeRow
        chevron={{
          open: yearOpen,
          label: `Year ${tree.season.label}`,
          onToggle: () => toggle(tree.season._id),
        }}
      >
        <NodeLink
          to={{ name: "season", seasonId: tree.season._id }}
          active={route.name === "season"}
          label={`Year ${tree.season.label}`}
          meta={`Phase 0 · ${PHASES[0].title}`}
          // Folded, the year answers for everything inside it.
          rollup={yearOpen ? tree.seasonRollup : everything}
        />
      </TreeRow>

      {yearOpen && (
        <>
          <GroupLabel
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                title="New chain plan"
                className="rounded px-1 text-2xs font-semibold text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
              >
                + New
              </button>
            }
          >
            Chain plans
          </GroupLabel>

          {tree.chains.map(({ chain, plans }) => (
            <div key={chain._id}>
              {plans.length === 0 ? (
                <TreeRow>
                  <div className="flex items-center justify-between gap-2 rounded-lg py-1 pr-1 pl-2">
                    <span className="min-w-0 truncate text-sm text-ink-500">{chain.name}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      title={`Start a ${chain.name} plan for ${tree.season.label}`}
                      onClick={async () => {
                        const plan = await createPlan({
                          seasonId: tree.season._id,
                          chainId: chain._id,
                        });
                        // Same landing as the modal path: straight onto the new plan.
                        if (plan.ok) navigate({ name: "plan", chainPlanId: plan.value });
                      }}
                    >
                      + Plan
                    </Button>
                  </div>
                </TreeRow>
              ) : (
                plans.map((node) => (
                  <PlanBranch
                    key={node.plan._id}
                    chainName={chain.name}
                    node={node}
                    route={route}
                    today={today}
                    open={!collapsed.has(node.plan._id) || node.plan._id === activePlanId}
                    onToggle={() => toggle(node.plan._id)}
                  />
                ))
              )}
            </div>
          ))}
        </>
      )}

      <GroupLabel>Reference</GroupLabel>
      <ReferenceLinks route={route} />

      {creating && (
        <NewChainPlanModal
          seasonId={tree.season._id}
          seasonLabel={tree.season.label}
          planless={planless.map(({ chain }) => chain)}
          onClose={() => setCreating(false)}
        />
      )}
    </nav>
  );
}

/** One chain plan and the promotions folded under it. */
function PlanBranch({
  chainName,
  node,
  route,
  today,
  open,
  onToggle,
}: {
  chainName: string;
  node: PlanNode;
  route: Route;
  today: string;
  open: boolean;
  onToggle: () => void;
}) {
  const hasPromotions = node.promotions.length > 0;

  return (
    <div>
      <TreeRow chevron={hasPromotions ? { open, label: chainName, onToggle } : undefined}>
        <NodeLink
          to={{ name: "plan", chainPlanId: node.plan._id }}
          active={route.name === "plan" && route.chainPlanId === node.plan._id}
          label={chainName}
          meta={`Phase ${node.plan.currentPhase} · ${PHASES[node.plan.currentPhase].title}`}
          rollup={
            open || !hasPromotions
              ? node.rollup
              : mergeRollups([node.rollup, ...node.promotions.map((promotion) => promotion.rollup)])
          }
        />
      </TreeRow>
      {open &&
        node.promotions.map((promotion) => (
          <TreeRow key={promotion.promotion._id}>
            <NodeLink
              to={{ name: "promotion", promotionId: promotion.promotion._id }}
              active={route.name === "promotion" && route.promotionId === promotion.promotion._id}
              nested
              label={promotion.promotion.name}
              meta={formatRange(promotion.promotion.startDate, promotion.promotion.endDate, today)}
              rollup={promotion.rollup}
            />
          </TreeRow>
        ))}
    </div>
  );
}

/**
 * The nav with no plan year behind it — an empty database, or a year id that
 * outlived its year. Still every route that works without one, so an early
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
        meta="Chains, brands, people, years, templates"
      />
    </>
  );
}

function GroupLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <p className="mt-4 mb-1 flex items-center justify-between gap-2 px-2 text-3xs font-semibold tracking-wider text-ink-600 uppercase">
      <span>{children}</span>
      {action}
    </p>
  );
}

/**
 * One row of the tree: an optional fold control in a fixed gutter, then the
 * node. The gutter is always there so folded and leaf rows line up.
 */
function TreeRow({
  chevron,
  children,
}: {
  chevron?: { open: boolean; label: string; onToggle: () => void };
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-0.5">
      {chevron === undefined ? (
        <span aria-hidden className="w-4 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={chevron.onToggle}
          aria-expanded={chevron.open}
          aria-label={`${chevron.open ? "Collapse" : "Expand"} ${chevron.label}`}
          className="mt-1.5 flex h-5 w-4 shrink-0 items-center justify-center rounded text-3xs text-ink-600 transition hover:bg-ink-800 hover:text-ink-200"
        >
          {chevron.open ? "▾" : "▸"}
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
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
  nested = false,
  label,
  meta,
  rollup,
}: {
  to: Route;
  active: boolean;
  /** A promotion under its plan: indented with a guide line. */
  nested?: boolean;
  label: string;
  meta: string;
  rollup: Rollup;
}) {
  return (
    <a
      href={href(to)}
      className={`${nodeClass(active)} pr-2 ${
        nested ? "ml-1 border-l border-ink-800 pl-3" : "pl-2"
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
