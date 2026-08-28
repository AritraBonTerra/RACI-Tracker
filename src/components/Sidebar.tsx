import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatRange } from "../lib/dates";
import { CONTEXT_HINT, PHASES } from "../lib/domain";
import { href, navigate, type Route } from "../lib/router";
import { useReportedMutation } from "../lib/toast";
import { RollupChips, mergeRollups, type Rollup } from "./Rollup";
import { Button, Field, Modal, Pill, Skeleton, inputClass } from "./ui";

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
//
// It is also where scoped navigation shows up (#24). The backend has already
// decided what belongs in the tree, so a node here is a link when its reach is
// "full" and a plain grey label when it is "context" — the year above someone's
// chain plan, the chain above someone's promotion. Nothing else is in the tree
// at all: no locked rows, no counts of work behind a wall. The label is
// deliberately unclickable rather than disabled, because there is nothing on
// the other side of it to fail at.

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
  isAdministrator,
  showDashboard,
}: {
  tree: Tree;
  route: Route;
  /** Starting a chain plan is an Administrator's move (#22), so is its button. */
  isAdministrator: boolean;
  /** False for a Member whose whole world is one Promotion (#24). */
  showDashboard: boolean;
}) {
  const createPlan = useReportedMutation(api.chainPlans.create);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });

  // The plan the current page lives under, so its branch stays open even when
  // its chevron says collapsed — navigation never lands inside a hidden node.
  const activePlanId =
    route.name === "plan"
      ? route.chainPlanId
      : route.name === "promotion"
        ? tree.chains
            .flatMap((chain) => chain.plans)
            .find((node) =>
              node.promotions.some(
                (promotion) => promotion.promotion._id === route.promotionId,
              ),
            )?.chainPlanId
        : undefined;

  const yearOpen =
    !collapsed.has(tree.season._id) ||
    route.name === "season" ||
    activePlanId !== undefined;

  // The root node speaks for the whole year, so it adds up every node below it —
  // every node *the viewer has*, which is what makes the dashboard's headline
  // and this chip agree.
  const everything = mergeRollups([
    ...(tree.seasonRollup === null ? [] : [tree.seasonRollup]),
    ...tree.chains.flatMap((chain) =>
      chain.plans.flatMap((plan) => [
        ...(plan.reach === "full" ? [plan.rollup] : []),
        ...plan.promotions.map((promotion) => promotion.rollup),
      ]),
    ),
  ]);

  const planless = tree.chains.filter((chain) => chain.plans.length === 0);

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {showDashboard && (
        <TreeRow>
          <NodeLink
            to={{ name: "home" }}
            active={route.name === "home"}
            label="Dashboard"
            meta="Everything that needs attention"
            rollup={everything}
          />
        </TreeRow>
      )}

      <GroupLabel>Plan year</GroupLabel>

      <TreeRow
        chevron={{ open: yearOpen, onToggle: () => toggle(tree.season._id) }}
      >
        {tree.reach === "full" ? (
          <NodeLink
            to={{ name: "season", seasonId: tree.season._id }}
            active={route.name === "season"}
            label={`Year ${tree.season.label}`}
            meta={`Phase 0 · ${PHASES[0].title}`}
            // Folded, the year answers for everything inside it.
            rollup={yearOpen ? (tree.seasonRollup ?? everything) : everything}
          />
        ) : (
          // The year above someone's chain plan or promotion: a name, so they
          // know which year they are in, and no phase 0 behind it.
          <ContextNode label={`Year ${tree.season.label}`} />
        )}
      </TreeRow>

      {yearOpen && (
        <>
          <GroupLabel
            action={
              isAdministrator && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  title="New chain plan"
                  className="rounded px-1 text-2xs font-semibold text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
                >
                  + New
                </button>
              )
            }
          >
            Chain plans
          </GroupLabel>

          {tree.chains.map(({ chain, plans }) => (
            <div key={chain._id}>
              {plans.length === 0 ? (
                <TreeRow>
                  <div className="flex items-center justify-between gap-2 rounded-lg py-1 pr-1 pl-2">
                    <span className="min-w-0 truncate text-sm text-ink-500">
                      {chain.name}
                    </span>
                    <Button
                      size="xs"
                      variant="ghost"
                      title={`Start a ${chain.name} plan for ${tree.season.label}`}
                      onClick={() =>
                        void createPlan({
                          seasonId: tree.season._id,
                          chainId: chain._id,
                        })
                      }
                    >
                      + Plan
                    </Button>
                  </div>
                </TreeRow>
              ) : (
                plans.map((node) => (
                  <PlanBranch
                    key={node.chainPlanId}
                    chainName={chain.name}
                    node={node}
                    route={route}
                    open={
                      !collapsed.has(node.chainPlanId) ||
                      node.chainPlanId === activePlanId
                    }
                    onToggle={() => toggle(node.chainPlanId)}
                  />
                ))
              )}
            </div>
          ))}
        </>
      )}

      <GroupLabel>Reference</GroupLabel>
      <ReferenceLinks route={route} isAdministrator={isAdministrator} />

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
  open,
  onToggle,
}: {
  chainName: string;
  node: PlanNode;
  route: Route;
  open: boolean;
  onToggle: () => void;
}) {
  const hasPromotions = node.promotions.length > 0;

  return (
    <div>
      <TreeRow chevron={hasPromotions ? { open, onToggle } : undefined}>
        {node.reach === "full" ? (
          <NodeLink
            to={{ name: "plan", chainPlanId: node.chainPlanId }}
            active={route.name === "plan" && route.chainPlanId === node.chainPlanId}
            label={chainName}
            meta={`Phase ${node.plan.currentPhase} · ${PHASES[node.plan.currentPhase].title}`}
            rollup={
              open || !hasPromotions
                ? node.rollup
                : mergeRollups([
                    node.rollup,
                    ...node.promotions.map((promotion) => promotion.rollup),
                  ])
            }
          />
        ) : (
          // The chain above someone's promotion. No phase, no counts: phases
          // 1-4 are the plan's content and the grant did not include them.
          <ContextNode label={chainName} />
        )}
      </TreeRow>
      {open &&
        node.promotions.map((promotion) => (
          <TreeRow key={promotion.promotion._id}>
            <NodeLink
              to={{ name: "promotion", promotionId: promotion.promotion._id }}
              active={
                route.name === "promotion" &&
                route.promotionId === promotion.promotion._id
              }
              nested
              label={promotion.promotion.name}
              meta={formatRange(
                promotion.promotion.startDate,
                promotion.promotion.endDate,
              )}
              rollup={promotion.rollup}
            />
          </TreeRow>
        ))}
    </div>
  );
}

/**
 * The "+ New" behind the Chain plans group: pick a chain that has no plan this
 * year, or name a brand-new chain without the detour through Manage. Either
 * way the plan lands with the phase 1–4 template stamped on it.
 */
function NewChainPlanModal({
  seasonId,
  seasonLabel,
  planless,
  onClose,
}: {
  seasonId: Id<"seasons">;
  seasonLabel: string;
  planless: ReadonlyArray<{ _id: Id<"chains">; name: string }>;
  onClose: () => void;
}) {
  const createChain = useReportedMutation(api.chains.create);
  const createPlan = useReportedMutation(api.chainPlans.create);

  const [chainId, setChainId] = useState<Id<"chains"> | "">(planless[0]?._id ?? "");
  const [newName, setNewName] = useState("");

  const usingNew = newName.trim() !== "";
  const ready = usingNew || chainId !== "";

  const submit = async () => {
    let target: Id<"chains"> | "" = chainId;
    if (usingNew) {
      const chain = await createChain({ name: newName });
      if (!chain.ok) return;
      target = chain.value;
    }
    if (target === "") return;
    const plan = await createPlan({ seasonId, chainId: target });
    if (!plan.ok) return;
    onClose();
    navigate({ name: "plan", chainPlanId: plan.value });
  };

  return (
    <Modal
      title={`New chain plan for ${seasonLabel}`}
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="primary" disabled={!ready} onClick={submit}>
            Create plan
          </Button>
        </>
      }
    >
      {planless.length > 0 && (
        <Field label="Chain" hint="Only chains without a plan this year are listed.">
          <select
            value={usingNew ? "" : chainId}
            disabled={usingNew}
            onChange={(event) => {
              const next = planless.find((chain) => chain._id === event.target.value);
              setChainId(next?._id ?? "");
            }}
            className="h-9 w-full cursor-pointer rounded-md border border-ink-700 bg-ink-950 px-2 text-sm text-ink-100 transition hover:border-ink-500 focus:border-sand-500 focus:outline-none disabled:opacity-40"
          >
            {planless.map((chain) => (
              <option key={chain._id} value={chain._id}>
                {chain.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field
        label={planless.length > 0 ? "…or a new chain" : "Chain name"}
        hint="Typing a name here creates the chain and its plan together."
      >
        <input
          autoFocus={planless.length === 0}
          value={newName}
          placeholder="Vons"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ready) void submit();
          }}
          className={inputClass}
        />
      </Field>
      <p className="text-2xs text-ink-500">
        One plan per chain per year. The new plan starts with the phase 1–4
        template checklist — undated and unassigned until you say otherwise.
      </p>
    </Modal>
  );
}

/**
 * The nav with no plan year behind it — an empty database, or a year id that
 * outlived its year. Still every route that works without one, so an early
 * visit or a stale link is never a dead end.
 */
export function StaticNav({
  route,
  isAdministrator,
}: {
  route: Route;
  isAdministrator: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <PlainLink
        to={{ name: "home" }}
        active={route.name === "home"}
        label="Dashboard"
        meta="Everything that needs attention"
      />
      <GroupLabel>Reference</GroupLabel>
      <ReferenceLinks route={route} isAdministrator={isAdministrator} />
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

/**
 * People is readable by every signed-in account — pickers and task rows have to
 * resolve to real names (#22). Manage governs the hierarchy and the Directory
 * governs access, so both are Administrator surfaces and are absent rather than
 * greyed out for a Member.
 */
function ReferenceLinks({
  route,
  isAdministrator,
}: {
  route: Route;
  isAdministrator: boolean;
}) {
  return (
    <>
      <PlainLink
        to={{ name: "people" }}
        active={route.name === "people"}
        label="People"
        meta="Who is loaded, and how much"
      />
      {isAdministrator && (
        <>
          <PlainLink
            to={{ name: "manage" }}
            active={route.name === "manage"}
            label="Manage"
            meta="Chains, brands, people, years, templates"
          />
          <DirectoryLink route={route} />
        </>
      )}
    </>
  );
}

/**
 * The Directory, with the awaiting-access queue on its badge (#30, story 20):
 * nobody should sit at the "access comes next" screen unnoticed, and this is
 * the only place in the shell that would notice.
 *
 * Its own component so the count query is skipped entirely for a Member —
 * the query would refuse them anyway, and a refused query on every page is a
 * console full of noise.
 */
function DirectoryLink({ route }: { route: Route }) {
  const awaiting = useQuery(api.directory.awaitingCount, {});

  return (
    <PlainLink
      to={{ name: "directory" }}
      active={route.name === "directory"}
      label="Directory"
      meta="Accounts, roles, grants, audit"
      badge={
        awaiting !== undefined && awaiting > 0 ? (
          <Pill className="bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40 ring-inset">
            {awaiting}
          </Pill>
        ) : undefined
      }
    />
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
  chevron?: { open: boolean; onToggle: () => void };
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
          aria-label={chevron.open ? "Collapse" : "Expand"}
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

/**
 * A tree node that is only a name: the year above a granted chain plan, the
 * chain above a granted promotion. Not a disabled link — there is nothing
 * behind it to be denied at — and no chips, because its counts are content.
 */
function ContextNode({ label }: { label: string }) {
  return (
    <span
      title={CONTEXT_HINT}
      className="flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-500"
    >
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function PlainLink({
  to,
  active,
  label,
  meta,
  badge,
}: {
  to: Route;
  active: boolean;
  label: string;
  meta: string;
  /** A count worth interrupting for, where a tier node would carry chips. */
  badge?: ReactNode;
}) {
  return (
    <a href={href(to)} className={`${nodeClass(active)} px-2`}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-2xs text-ink-500">{meta}</span>
      </span>
      {badge}
    </a>
  );
}
