import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { formatRange } from "../lib/dates";
import { href, type Route } from "../lib/router";
import { useReportedMutation } from "../lib/toast";
import { RollupChips, mergeRollups, type Rollup } from "./Rollup";
import { Button } from "./ui";

// The navigation: the dashboard at the root, then the three tiers —
// Season -> Chain Plans -> Promotions — with each node carrying its own health,
// so the sidebar answers "where is the trouble?" before anything is clicked.

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
    <nav className="flex flex-col gap-1 overflow-y-auto px-3 py-4">
      <NodeLink
        to={{ name: "home" }}
        active={route.name === "home"}
        depth={0}
        label="Dashboard"
        meta="Everything that needs attention"
        rollup={everything}
      />

      <p className="mt-4 mb-1 px-2 text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
        Season
      </p>

      <NodeLink
        to={{ name: "season", seasonId: tree.season._id }}
        active={route.name === "season"}
        depth={0}
        label={`Season ${tree.season.label}`}
        meta="Phase 0 · Strategic foundation"
        rollup={tree.seasonRollup}
      />

      <p className="mt-4 mb-1 px-2 text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
        Chain plans
      </p>

      {tree.chains.map(({ chain, plans }) => (
        <div key={chain._id}>
          {plans.length === 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
              <span className="truncate text-sm text-slate-500">{chain.name}</span>
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
                  meta={`Phases 1–4 · currently phase ${node.plan.currentPhase}`}
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

      <a
        href={href({ name: "people" })}
        className={`mt-4 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition ${
          route.name === "people"
            ? "bg-slate-800 text-slate-50 ring-1 ring-slate-700 ring-inset"
            : "text-slate-300 hover:bg-slate-800/60"
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">People</span>
          <span className="block text-[11px] text-slate-500">
            Directory and who is loaded
          </span>
        </span>
      </a>
    </nav>
  );
}

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
      className={`flex items-center justify-between gap-2 rounded-lg py-1.5 pr-2 transition ${
        active
          ? "bg-slate-800 text-slate-50 ring-1 ring-slate-700 ring-inset"
          : "text-slate-300 hover:bg-slate-800/60"
      } ${depth === 0 ? "pl-2" : "ml-3 border-l border-slate-800 pl-3"}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium" title={label}>
          {label}
        </span>
        <span className="block truncate text-[11px] text-slate-500">{meta}</span>
      </span>
      <RollupChips rollup={rollup} />
    </a>
  );
}
