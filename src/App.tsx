import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useAccount, useIsAdministrator, useLanding } from "./components/AuthGate";
import { AccountMenu } from "./components/AuthScreens";
import { Sidebar, SidebarSkeleton, StaticNav } from "./components/Sidebar";
import { NotFound, TierSkeleton, ViewBoundary } from "./components/page";
import { Button, Field, Modal, inputClass } from "./components/ui";
import { formatDay, todayIso } from "./lib/dates";
import { usePeople } from "./lib/people";
import { href, navigate, useRoute } from "./lib/router";
import { useReportedMutation } from "./lib/toast";
import { ThemeToggle } from "./lib/theme";
import { ChainPlanView } from "./views/ChainPlanView";
import { DashboardSkeleton, HomeView } from "./views/HomeView";
import { ManageView } from "./views/ManageView";
import { PeopleView } from "./views/PeopleView";
import { PromotionView } from "./views/PromotionView";
import { SeasonView } from "./views/SeasonView";

// The shell: a season-scoped navigation tree on the left, one view on the right.
// Every route is a hash link, so the browser's back button and a pasted URL both
// land on the same promotion. `#/` is the dashboard — the screen the tool opens
// on, because the first question is always "what needs attention?".
//
// The tree is the whole navigation, People and Manage included, so there is one
// place to look for "where do I go?" on a laptop and one button to press for it
// on a phone.

export default function App() {
  // "Today" is fixed for the session so a long-lived tab does not silently
  // reclassify overdue work mid-demo.
  const [today] = useState(todayIso);
  const route = useRoute();
  const people = usePeople();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newYearOpen, setNewYearOpen] = useState(false);
  const account = useAccount();
  const isAdministrator = useIsAdministrator();
  const landing = useLanding();

  const seasons = useQuery(api.seasons.list);

  // A Member whose whole world is one Promotion never sees the dashboard: it
  // would restate the single card underneath it (#24). The redirect replaces
  // the history entry so the back button leaves the app rather than bouncing.
  const landingPromotionId =
    landing.kind === "promotion" ? landing.promotionId : undefined;
  useEffect(() => {
    if (landingPromotionId === undefined || route.name !== "home") return;
    window.location.replace(href({ name: "promotion", promotionId: landingPromotionId }));
  }, [landingPromotionId, route.name]);

  // A deep link to a plan or promotion has to resolve its season before the
  // tree can be drawn around it.
  const context = useQuery(
    api.seasons.contextFor,
    route.name === "plan"
      ? { chainPlanId: route.chainPlanId }
      : route.name === "promotion"
        ? { promotionId: route.promotionId }
        : "skip",
  );

  // Following a link on a phone should leave the drawer behind.
  const hash = href(route);
  useEffect(() => setDrawerOpen(false), [hash]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const seasonId: Id<"seasons"> | undefined =
    route.name === "season" ? route.seasonId : (context?.seasonId ?? seasons?.[0]?._id);

  // Three states, in order: still asking, nothing to hang a tree off (the flat
  // nav still reaches the views that work against an empty database), the tree.
  const nav =
    seasons === undefined ? (
      <SidebarSkeleton />
    ) : seasonId === undefined ? (
      <StaticNav route={route} isAdministrator={isAdministrator} />
    ) : (
      <SeasonTree
        seasonId={seasonId}
        today={today}
        isAdministrator={isAdministrator}
        showDashboard={landing.kind === "dashboard"}
      />
    );

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <header className="sticky top-0 z-30 flex h-header items-center justify-between gap-3 border-b border-ink-800 bg-ink-950/90 px-3 backdrop-blur sm:px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            className="lg:hidden"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span aria-hidden className="text-base leading-none">
              ☰
            </span>
          </Button>
          <a
            href={href({ name: "home" })}
            className="flex min-w-0 items-baseline gap-2.5"
          >
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap text-ink-50">
              RACI Tracker
            </span>
            <span className="hidden truncate text-2xs text-ink-500 md:inline">
              Integrated Commercial Cycle · Viña Concha y Toro USA
            </span>
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-2xs text-ink-500 md:inline">
            Today {formatDay(today)}
          </span>
          <ThemeToggle />
          {seasons !== undefined && seasons.length > 0 && seasonId !== undefined && (
            <select
              aria-label="Plan year"
              value={seasonId}
              onChange={(event) => {
                // The last option is an action, not a year — the select's value
                // stays controlled on the current year, so no flicker.
                if (event.target.value === "__new__") {
                  setNewYearOpen(true);
                  return;
                }
                const next = seasons.find((season) => season._id === event.target.value);
                if (next === undefined) return;
                // A year the viewer only sees as context has no page behind it,
                // so switching to it lands on the dashboard for that year.
                navigate(
                  next.reach === "full"
                    ? { name: "season", seasonId: next._id }
                    : { name: "home" },
                );
              }}
              className="h-8 cursor-pointer rounded-md border border-ink-700 bg-ink-900 px-2 text-xs text-ink-200 transition hover:border-ink-500"
            >
              {seasons.map((season) => (
                <option key={season._id} value={season._id}>
                  Year {season.label}
                </option>
              ))}
              {/* Creating a plan year is Administrator-only (#22). */}
              {isAdministrator && <option value="__new__">+ New year…</option>}
            </select>
          )}
          <AccountMenu
            displayName={account.displayName}
            email={account.email}
            role={account.role}
          />
        </div>
      </header>

      <div className="flex items-start">
        <aside className="sticky top-header hidden h-[calc(100dvh-var(--spacing-header))] w-72 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900/25 lg:block">
          {nav}
        </aside>

        {drawerOpen && (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden"
            />
            <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-ink-800 bg-ink-950 shadow-2xl shadow-black/50 lg:hidden">
              <div className="flex h-header shrink-0 items-center justify-between border-b border-ink-800 px-3">
                <span className="text-sm font-semibold tracking-tight text-ink-50">
                  RACI Tracker
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                >
                  ✕
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
            </aside>
          </>
        )}

        {newYearOpen && (
          <NewYearModal
            takenYears={(seasons ?? []).map((season) => season.year)}
            onClose={() => setNewYearOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-5 lg:px-8">
          {/* Keyed on the route so a broken link does not poison the next one. */}
          <ViewBoundary key={hash}>
            {/* Manage and the directory do not hang off a season, so they never
                wait for one. Everything else shows the placeholder shaped like
                the page it is about to become. */}
            {route.name === "manage" ? (
              // Manage governs the hierarchy, so a Member typing the URL gets
              // the same nothing the sidebar showed them.
              isAdministrator ? (
                <ManageView people={people} />
              ) : (
                <NotFound />
              )
            ) : route.name === "people" ? (
              <PeopleView today={today} personId={route.personId} />
            ) : seasons === undefined ? (
              route.name === "home" ? (
                <DashboardSkeleton />
              ) : (
                <TierSkeleton />
              )
            ) : seasonId === undefined ? (
              <NoSeasons />
            ) : route.name === "plan" ? (
              <ChainPlanView
                chainPlanId={route.chainPlanId}
                today={today}
                people={people}
                focusTaskId={route.focusTaskId}
              />
            ) : route.name === "promotion" ? (
              <PromotionView
                promotionId={route.promotionId}
                today={today}
                people={people}
                focusTaskId={route.focusTaskId}
              />
            ) : route.name === "season" ? (
              <SeasonPage
                seasonId={seasonId}
                today={today}
                people={people}
                focusTaskId={route.focusTaskId}
              />
            ) : (
              <HomeView seasonId={seasonId} today={today} people={people} />
            )}
          </ViewBoundary>
        </main>
      </div>
    </div>
  );
}

/** The tree is its own component so a slow tier view never blocks navigation. */
function SeasonTree({
  seasonId,
  today,
  isAdministrator,
  showDashboard,
}: {
  seasonId: Id<"seasons">;
  today: string;
  isAdministrator: boolean;
  showDashboard: boolean;
}) {
  const tree = useQuery(api.seasons.tree, { seasonId, today });
  const route = useRoute();

  if (tree === undefined) return <SidebarSkeleton />;
  // The season behind the URL is gone, or out of scope; the flat nav is still
  // a way out either way.
  if (tree === null) return <StaticNav route={route} isAdministrator={isAdministrator} />;
  return (
    <Sidebar
      tree={tree}
      route={route}
      isAdministrator={isAdministrator}
      showDashboard={showDashboard}
    />
  );
}

/** The season page needs the same tree for its chain-plan cards. */
function SeasonPage({
  seasonId,
  today,
  people,
  focusTaskId,
}: {
  seasonId: Id<"seasons">;
  today: string;
  people: ReturnType<typeof usePeople>;
  focusTaskId?: Id<"tasks">;
}) {
  const tree = useQuery(api.seasons.tree, { seasonId, today });
  if (tree === undefined) return <TierSkeleton panels={2} />;
  if (tree === null) return <NotFound />;
  return (
    <SeasonView
      seasonId={seasonId}
      today={today}
      people={people}
      tree={tree}
      focusTaskId={focusTaskId}
    />
  );
}

/**
 * Creating the next plan year, right where you looked for it — the year
 * dropdown. Comes pre-filled with the year after the latest one, because that
 * is almost always the year being planned.
 */
function NewYearModal({
  takenYears,
  onClose,
}: {
  takenYears: readonly number[];
  onClose: () => void;
}) {
  const create = useReportedMutation(api.seasons.create);
  const [draft, setDraft] = useState(() =>
    String(takenYears.length === 0 ? new Date().getFullYear() : Math.max(...takenYears) + 1),
  );

  const year = Number(draft.trim());
  const ready = Number.isInteger(year) && year >= 2000 && year <= 2100;

  const submit = async () => {
    if (!ready) return;
    const created = await create({ year });
    if (!created.ok) return;
    onClose();
    navigate({ name: "season", seasonId: created.value });
  };

  return (
    <Modal
      title="New plan year"
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="primary" disabled={!ready} onClick={submit}>
            Create year
          </Button>
        </>
      }
    >
      <Field label="Year">
        <input
          autoFocus
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className={`${inputClass} tabular-nums`}
        />
      </Field>
      <p className="text-2xs text-ink-500">
        One plan year per calendar year. It starts with the phase-0 template
        checklist; chain plans and promotions hang off it from there.
      </p>
    </Modal>
  );
}

function NoSeasons() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl border border-ink-800 bg-ink-900/60 p-6 text-center">
        <h1 className="text-lg font-semibold text-ink-100">No plan years yet</h1>
        <p className="mt-1.5 text-sm text-ink-400">
          A plan year is what everything else hangs off — phase 0, then a chain
          plan per account, then the promotions under it. Create one to start.
        </p>
        <Button
          variant="primary"
          size="md"
          className="mt-4"
          onClick={() => navigate({ name: "manage" })}
        >
          Open Manage
        </Button>
      </div>
    </div>
  );
}
