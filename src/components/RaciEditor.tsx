import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { PHASES, type PhaseNumber, responsiblesOf, roleLetters } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { type RaciMatrix, type RaciRole, ROLE_META, useRaciMatrix } from "../lib/raci";
import { useReportedMutation } from "../lib/toast";
import { Picker } from "./Picker";

// Assignment, everywhere a task appears. Two rules shape this file:
//
// 1. The slide-16 matrix says which *function* is expected to act on a phase.
//    It is the pre-filled baseline — the picker opens on those functions alone,
//    with everyone else one click away — but it never makes a task assigned.
// 2. Only named Responsible people do (CONTEXT.md: Unassigned), so the R field
//    is the loud one, and picking someone is two clicks from anywhere. R takes
//    several people (shared work is real); A stays exactly one — the name you
//    chase when the task is late.

const toggled = (current: ReadonlyArray<Id<"people">>, personId: Id<"people">) =>
  current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];

/** The RACI block on an expanded task row: defaults on top, named people below. */
export function RaciEditor({ task, people }: { task: Doc<"tasks">; people: PeopleDirectory }) {
  const update = useReportedMutation(api.tasks.update);
  const matrix = useRaciMatrix();
  const cells = matrix.cellsFor(task.phase);
  const responsibles = responsiblesOf(task);

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/60">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-ink-800/70 px-3 py-2">
        <p className="text-3xs font-semibold tracking-wider text-ink-400 uppercase">
          RACI · phase {task.phase} {PHASES[task.phase].title}
        </p>
        {cells.length > 0 && (
          <p
            className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-ink-600"
            title="The slide-16 defaults for this phase — guidance, not an assignment."
          >
            <span className="font-semibold tracking-wider uppercase">Defaults</span>
            {cells.map((cell) => (
              <span key={cell.functionId} title={cell.note}>
                <span className="font-mono text-ink-400">{roleLetters(cell.roles) || "—"}</span>{" "}
                {cell.functionName}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="grid gap-3 px-3 py-3 md:grid-cols-2 xl:grid-cols-4">
        <RoleSlot role="responsible" filled={responsibles.length > 0}>
          <PersonList
            role="responsible"
            phase={task.phase}
            selected={responsibles}
            people={people}
            matrix={matrix}
            onToggle={(personId) =>
              void update({
                taskId: task._id,
                responsiblePersonIds: toggled(responsibles, personId),
              })
            }
          />
        </RoleSlot>

        <RoleSlot role="accountable" filled={task.accountablePersonId !== undefined}>
          <PersonField
            role="accountable"
            phase={task.phase}
            value={task.accountablePersonId}
            people={people}
            matrix={matrix}
            emptyLabel="No named owner"
            onSelect={(accountablePersonId) =>
              void update({ taskId: task._id, accountablePersonId })
            }
          />
        </RoleSlot>

        <RoleSlot role="consulted" filled={task.consultedPersonIds.length > 0}>
          <PersonList
            role="consulted"
            phase={task.phase}
            selected={task.consultedPersonIds}
            people={people}
            matrix={matrix}
            onToggle={(personId) =>
              void update({
                taskId: task._id,
                consultedPersonIds: toggled(task.consultedPersonIds, personId),
              })
            }
          />
        </RoleSlot>

        <RoleSlot role="informed" filled={task.informedPersonIds.length > 0}>
          <PersonList
            role="informed"
            phase={task.phase}
            selected={task.informedPersonIds}
            people={people}
            matrix={matrix}
            onToggle={(personId) =>
              void update({
                taskId: task._id,
                informedPersonIds: toggled(task.informedPersonIds, personId),
              })
            }
          />
        </RoleSlot>
      </div>
    </div>
  );
}

/** One lettered slot. R empty is the only one that gets to look like a problem. */
function RoleSlot({
  role,
  filled,
  children,
}: {
  role: RaciRole;
  filled: boolean;
  children: ReactNode;
}) {
  const meta = ROLE_META[role];
  const alarming = role === "responsible" && !filled;

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded font-mono text-3xs font-bold ${
            alarming
              ? "bg-rose-500 text-white"
              : filled
                ? "bg-ink-700 text-ink-200"
                : "bg-ink-800 text-ink-500"
          }`}
        >
          {meta.letter}
        </span>
        <span
          className={`text-3xs font-semibold tracking-wider uppercase ${
            alarming ? "text-rose-300" : "text-ink-500"
          }`}
        >
          {meta.label}
        </span>
        <span className="hidden text-3xs text-ink-600 xl:inline">{meta.hint}</span>
      </p>
      {children}
    </div>
  );
}

/** The single-person slot (A) as a click-to-open field. */
export function PersonField({
  role,
  phase,
  value,
  people,
  matrix,
  onSelect,
  emptyLabel,
}: {
  role: RaciRole;
  phase: PhaseNumber;
  value: Id<"people"> | undefined;
  people: PeopleDirectory;
  matrix: RaciMatrix;
  onSelect: (next: Id<"people"> | null) => void;
  emptyLabel: string;
}) {
  const person = value === undefined ? undefined : people.byId.get(value);
  const alarming = role === "responsible" && person === undefined;

  return (
    <Picker
      role={role}
      phase={phase}
      people={people}
      matrix={matrix}
      selected={value === undefined ? [] : [value]}
      onPick={(next) => onSelect(next)}
      onClear={value === undefined ? undefined : () => onSelect(null)}
      trigger={
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="truncate">{person?.name ?? emptyLabel}</span>
          {person?.function != null && (
            <span className="truncate text-3xs text-ink-500">{person.function.name}</span>
          )}
        </span>
      }
      triggerClass={
        alarming
          ? "border-rose-500/70 bg-rose-500/10 text-rose-200 hover:border-rose-400"
          : person === undefined
            ? "border-ink-700 bg-ink-900 text-ink-500 hover:border-ink-500"
            : "border-ink-700 bg-ink-900 text-ink-200 hover:border-ink-500"
      }
    />
  );
}

/**
 * A many-person slot (R, C or I): chips you can drop, plus one button to add.
 * An empty R is the only one that gets to look like an emergency, because it is
 * one (CONTEXT.md: Unassigned).
 */
function PersonList({
  role,
  phase,
  selected,
  people,
  matrix,
  onToggle,
}: {
  role: RaciRole;
  phase: PhaseNumber;
  selected: ReadonlyArray<Id<"people">>;
  people: PeopleDirectory;
  matrix: RaciMatrix;
  onToggle: (personId: Id<"people">) => void;
}) {
  const alarming = role === "responsible" && selected.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map((id) => {
        const person = people.byId.get(id);
        if (person === undefined) return null;
        return (
          <button
            key={id}
            type="button"
            title={`Remove ${person.name}`}
            onClick={() => onToggle(id)}
            className="group inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-2xs text-ink-300 ring-1 ring-ink-700 ring-inset transition hover:bg-ink-700 hover:text-ink-100"
          >
            {person.name}
            <span className="text-ink-600 group-hover:text-rose-300">✕</span>
          </button>
        );
      })}
      <Picker
        role={role}
        phase={phase}
        people={people}
        matrix={matrix}
        multi
        // The first R is the urgent one; adding a second is list curation.
        closeOnPick={alarming}
        selected={selected}
        onPick={(next) => {
          if (next !== null) onToggle(next);
        }}
        trigger={<span>{selected.length === 0 ? (alarming ? "Assign R" : "+ Add") : "+"}</span>}
        triggerClass={
          alarming
            ? "w-auto rounded-full border-rose-500/70 bg-rose-500/15 px-2 py-0.5 font-semibold text-rose-200 hover:border-rose-400 hover:bg-rose-500/25"
            : "w-auto rounded-full border-dashed border-ink-700 bg-transparent px-2 py-0.5 text-ink-500 hover:border-ink-500 hover:text-ink-200"
        }
      />
    </div>
  );
}

/**
 * The two-click Responsible assignment used by checklist rows and the
 * needs-attention rail: one click opens the list, one click assigns. No
 * navigation, because the whole point of the rail is to fix things in place.
 */
export function AssignButton({ task, people }: { task: Doc<"tasks">; people: PeopleDirectory }) {
  const update = useReportedMutation(api.tasks.update);
  const matrix = useRaciMatrix();

  // R is a list: the button reads as the first name plus how many more, and the
  // picker toggles membership. Assigning the *first* person closes on pick —
  // that is the rail's two-click fix — while editing an existing list stays open.
  const selected = responsiblesOf(task);
  const first = selected.length === 0 ? undefined : people.byId.get(selected[0]);

  return (
    <Picker
      role="responsible"
      phase={task.phase}
      people={people}
      matrix={matrix}
      align="right"
      multi
      closeOnPick={selected.length === 0}
      selected={selected}
      onPick={(next) => {
        if (next !== null) {
          void update({
            taskId: task._id,
            responsiblePersonIds: toggled(selected, next),
          });
        }
      }}
      trigger={
        <span className="whitespace-nowrap">
          {first === undefined
            ? "Assign R"
            : selected.length === 1
              ? first.name
              : `${first.name} +${selected.length - 1}`}
        </span>
      }
      triggerClass={
        first === undefined
          ? "w-auto border-rose-500 bg-rose-500/20 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-500/30"
          : "w-auto border-ink-700 bg-ink-900 px-2 py-1 text-ink-200 hover:border-ink-500"
      }
    />
  );
}
