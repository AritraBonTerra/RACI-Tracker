import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Sidebar } from "./components/Sidebar";
import { Loading, NotFound } from "./components/page";
import { Button } from "./components/ui";
import { formatDay, todayIso } from "./lib/dates";
import { usePeople } from "./lib/people";
import { href, navigate, useRoute } from "./lib/router";
import { ChainPlanView } from "./views/ChainPlanView";
import { ManageView } from "./views/ManageView";
import { PromotionView } from "./views/PromotionView";
import { SeasonView } from "./views/SeasonView";

// The shell: a season-scoped navigation tree on the left, one tier view on the
// right. Every route is a hash link, so the browser's back button and a pasted
// URL both land on the same promotion.

export default function App() {
  // "Today" is fixed for the session so a long-lived tab does not silently
  // reclassify overdue work mid-demo.
  const [today] = useState(todayIso);
  const route = useRoute();
  const people = usePeople();

  const seasons = useQuery(api.seasons.list);

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

  if (seasons === undefined) return <Splash>Connecting…</Splash>;
  if (seasons.length === 0) {
    // Manage is the one view that still works with an empty database.
    return route.name === "manage" ? (
      <div className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
        <ManageView people={people} />
      </div>
    ) : (
      <NoSeasons />
    );
  }

  const fallbackSeasonId = seasons[0]._id;
  const seasonId: Id<"seasons"> =
    route.name === "season"
      ? route.seasonId
      : (context?.seasonId ?? fallbackSeasonId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-5 py-3 backdrop-blur">
        <a href={href({ name: "season", seasonId })} className="flex items-baseline gap-2.5">
          <span className="text-sm font-semibold tracking-tight text-slate-50">
            RACI Tracker
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            Integrated Commercial Cycle · Viña Concha y Toro USA
          </span>
        </a>

        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-slate-500 md:inline">
            Today {formatDay(today)}
          </span>
          <select
            value={seasonId}
            onChange={(event) => {
              const next = seasons.find((season) => season._id === event.target.value);
              if (next !== undefined) navigate({ name: "season", seasonId: next._id });
            }}
            className="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 focus:outline-none"
          >
            {seasons.map((season) => (
              <option key={season._id} value={season._id}>
                Season {season.label}
              </option>
            ))}
          </select>
          <Button
            variant={route.name === "manage" ? "secondary" : "ghost"}
            onClick={() => navigate({ name: "manage" })}
          >
            Manage
          </Button>
        </div>
      </header>

      <div className="flex items-start">
        <aside className="sticky top-[53px] hidden h-[calc(100vh-53px)] w-72 shrink-0 border-r border-slate-800 bg-slate-900/30 lg:block">
          <SeasonTree seasonId={seasonId} today={today} />
        </aside>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">
          {route.name === "manage" ? (
            <ManageView people={people} />
          ) : route.name === "plan" ? (
            <ChainPlanView chainPlanId={route.chainPlanId} today={today} people={people} />
          ) : route.name === "promotion" ? (
            <PromotionView promotionId={route.promotionId} today={today} people={people} />
          ) : (
            <SeasonPage seasonId={seasonId} today={today} people={people} />
          )}
        </main>
      </div>
    </div>
  );
}

/** The tree is its own component so a slow tier view never blocks navigation. */
function SeasonTree({ seasonId, today }: { seasonId: Id<"seasons">; today: string }) {
  const tree = useQuery(api.seasons.tree, { seasonId, today });
  const route = useRoute();

  if (tree === undefined) {
    return <p className="px-5 py-4 text-xs text-slate-600">Loading navigation…</p>;
  }
  if (tree === null) {
    return <p className="px-5 py-4 text-xs text-slate-600">Season not found.</p>;
  }
  return <Sidebar tree={tree} route={route} />;
}

/** The season page needs the same tree for its chain-plan cards. */
function SeasonPage({
  seasonId,
  today,
  people,
}: {
  seasonId: Id<"seasons">;
  today: string;
  people: ReturnType<typeof usePeople>;
}) {
  const tree = useQuery(api.seasons.tree, { seasonId, today });
  if (tree === undefined) return <Loading what="the season" />;
  if (tree === null) return <NotFound what="season" />;
  return <SeasonView seasonId={seasonId} today={today} people={people} tree={tree} />;
}

function Splash({ children }: { children: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-500">
      {children}
    </div>
  );
}

function NoSeasons() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-100">No seasons yet</h1>
        <p className="mt-1 text-sm text-slate-400">
          A season is the planning year everything else hangs off. Create one to start.
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
