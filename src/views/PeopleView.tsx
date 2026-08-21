import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Breadcrumb,
  HeaderSkeleton,
  PageHeader,
  PanelSkeleton,
} from "../components/page";
import { Button, EmptyState, Panel, Pill, Skeleton } from "../components/ui";
import { dueLabel, formatDay, isOverdue } from "../lib/dates";
import { PHASES, STATUSES } from "../lib/domain";
import { href, navigate, placeRoute } from "../lib/router";

// Who is on the hook, grouped by Function. The directory answers two questions a
// planning meeting keeps asking: who is in this bucket, and how much are they
// already carrying — because "give it to Alicia" is a different conversation
// when Alicia is Responsible for eleven things, four of them late.

type Directory = FunctionReturnType<typeof api.people.directory>;
type Entry = Directory[number]["people"][number];

export function PeopleView({
  today,
  personId,
}: {
  today: string;
  personId?: Id<"people">;
}) {
  const directory = useQuery(api.people.directory, { today });

  if (directory === undefined) return <DirectorySkeleton />;

  const headcount = directory.reduce((count, group) => count + group.people.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "People" }]} />}
        title="Directory"
        actions={
          <Button size="md" onClick={() => navigate({ name: "manage" })}>
            Add or edit people
          </Button>
        }
        meta={
          <>
            <span>{headcount} people</span>
            <span aria-hidden className="text-ink-700">
              ·
            </span>
            <span>{directory.length} functions</span>
            <span aria-hidden className="text-ink-700">
              ·
            </span>
            <span className="text-ink-500">
              A named person is what makes a task assigned — a function never is.
            </span>
          </>
        }
      />

      {personId !== undefined && <PersonWorkload personId={personId} today={today} />}

      {headcount === 0 ? (
        <Panel title="Nobody loaded yet">
          <EmptyState
            title="The directory is empty"
            action={
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate({ name: "manage" })}
              >
                Add people in Manage
              </Button>
            }
          >
            Until there are names here, every task on every checklist counts as unassigned
            — a function is a bucket, not a person who can be asked.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {directory.map((group) => (
            <Panel
              key={group.function._id}
              title={group.function.name}
              subtitle={
                group.function.kind === "internal"
                  ? "Internal stakeholder"
                  : "External stakeholder"
              }
              actions={
                <Pill
                  className={
                    group.function.kind === "internal"
                      ? "bg-ink-800 text-ink-300 ring-1 ring-ink-700 ring-inset"
                      : "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40 ring-inset"
                  }
                >
                  {group.people.length} {group.people.length === 1 ? "person" : "people"}
                </Pill>
              }
            >
              {group.people.length === 0 ? (
                <EmptyState title={`No one in ${group.function.name}`}>
                  Work the slide-16 matrix points at this function has nobody to land on.
                  Add someone in Manage and they become pickable everywhere.
                </EmptyState>
              ) : (
                group.people.map((entry) => (
                  <PersonRow
                    key={entry.person._id}
                    entry={entry}
                    selected={entry.person._id === personId}
                  />
                ))
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonRow({ entry, selected }: { entry: Entry; selected: boolean }) {
  const { person, load } = entry;

  return (
    <a
      href={href({ name: "people", personId: selected ? undefined : person._id })}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-800/70 px-4 py-2.5 transition last:border-b-0 ${
        selected ? "bg-ink-800/60" : "hover:bg-ink-800/30"
      }`}
    >
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium text-ink-100">{person.name}</p>
        <p className="truncate text-2xs text-ink-500">
          {person.title ?? "—"}
          {person.organization !== undefined && ` · ${person.organization}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <LoadChip letter="R" value={load.responsible} title="Responsible for" />
        <LoadChip letter="A" value={load.accountable} title="Accountable for" />
        {load.blocked > 0 && (
          <Pill className="bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/60 ring-inset">
            {load.blocked} blocked
          </Pill>
        )}
        {load.overdue > 0 && (
          <Pill className="bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 ring-inset">
            {load.overdue} late
          </Pill>
        )}
        <span className="w-16 text-right text-2xs text-ink-500 tabular-nums">
          {load.open} open
        </span>
      </div>
    </a>
  );
}

function LoadChip({
  letter,
  value,
  title,
}: {
  letter: string;
  value: number;
  title: string;
}) {
  return (
    <span
      title={`${title} ${value} task${value === 1 ? "" : "s"}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-2xs tabular-nums ${
        value === 0 ? "bg-ink-800/60 text-ink-600" : "bg-ink-800 text-ink-200"
      }`}
    >
      <span className="font-bold">{letter}</span>
      {value}
    </span>
  );
}

/** The drill-down: every task this person is named on, soonest ETA first. */
function PersonWorkload({ personId, today }: { personId: Id<"people">; today: string }) {
  const data = useQuery(api.people.workload, { personId, today });

  if (data === undefined) return <PanelSkeleton rows={4} />;
  if (data === null) {
    return (
      <Panel title="Person">
        <EmptyState
          title="This person is gone"
          action={
            <Button size="md" onClick={() => navigate({ name: "people" })}>
              Back to the directory
            </Button>
          }
        >
          The link still works, but whoever it pointed at has been removed from the
          directory.
        </EmptyState>
      </Panel>
    );
  }

  const details = [
    data.person.title,
    data.function?.name,
    data.person.organization,
  ].filter((part): part is string => part !== undefined);

  return (
    <Panel
      title={data.person.name}
      subtitle={details.join(" · ")}
      actions={
        <Button size="sm" onClick={() => navigate({ name: "people" })}>
          Close
        </Button>
      }
    >
      {data.tasks.length === 0 ? (
        <EmptyState tone="good" title={`${data.person.name} is carrying nothing`}>
          Not Responsible or Accountable for a single task right now — which makes them
          the obvious answer next time something on the dashboard needs an owner.
        </EmptyState>
      ) : (
        <ul>
          {data.tasks.map(({ task, place, isResponsible, isAccountable }) => {
            const late = isOverdue(task.eta, task.status, today);
            return (
              <li
                key={task._id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-800/70 px-4 py-2.5 last:border-b-0 hover:bg-ink-800/30"
              >
                <span className="flex w-10 shrink-0 gap-1 font-mono text-3xs font-bold">
                  {isResponsible && (
                    <span className="rounded bg-sand-400/20 px-1 text-sand-200">R</span>
                  )}
                  {isAccountable && (
                    <span className="rounded bg-sky-500/20 px-1 text-sky-300">A</span>
                  )}
                </span>

                <div className="min-w-40 flex-1">
                  <a
                    href={href(placeRoute(place, task._id))}
                    className="block truncate text-sm text-ink-100 hover:underline"
                  >
                    {task.name}
                  </a>
                  <p className="truncate text-2xs text-ink-500">
                    {place.chain !== null &&
                      place.tier !== "chainPlan" &&
                      `${place.chain} · `}
                    {place.label} · phase {task.phase} {PHASES[task.phase].title}
                  </p>
                </div>

                {task.status === "blocked" && task.blockedReason !== undefined && (
                  <span className="hidden max-w-48 truncate rounded bg-rose-500/10 px-1.5 py-0.5 text-2xs text-rose-200 ring-1 ring-rose-500/40 ring-inset md:inline">
                    “{task.blockedReason}”
                  </span>
                )}

                <span
                  className={`shrink-0 text-2xs sm:w-36 sm:text-right ${
                    late ? "font-semibold text-amber-300" : "text-ink-500"
                  }`}
                >
                  {/* Once delivered the countdown is noise — the date is the record. */}
                  {task.eta === undefined
                    ? "No ETA"
                    : task.status === "delivered"
                      ? formatDay(task.eta, today)
                      : `${formatDay(task.eta, today)} · ${dueLabel(task.eta, today)}`}
                </span>

                <Pill className={`shrink-0 ${STATUSES[task.status].pill}`}>
                  {STATUSES[task.status].label}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function DirectorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton metaCount={3} />
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60"
          >
            <div className="border-b border-ink-800 bg-ink-900/60 px-4 py-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-center gap-3 border-b border-ink-800/70 px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="mt-1.5 h-2.5 w-56 max-w-full" />
                </div>
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
