import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { PHASES, roleLetters, type PhaseNumber } from "../lib/domain";
import type { Person, PeopleDirectory } from "../lib/people";
import { useRaciMatrix, type RaciMatrix, type RaciRole } from "../lib/raci";
import { useReportedMutation } from "../lib/toast";

// Assignment, everywhere a task appears. Two rules shape this file:
//
// 1. The slide-16 matrix says which *function* is expected to act on a phase.
//    It is the pre-filled baseline — those functions are pinned to the top of
//    every picker — but it never makes a task assigned.
// 2. Only a named Responsible person does (CONTEXT.md: Unassigned), so the R
//    field is the loud one, and picking someone is two clicks from anywhere.

const ROLE_META = {
  responsible: { letter: "R", label: "Responsible", hint: "does the work" },
  accountable: { letter: "A", label: "Accountable", hint: "owns the outcome" },
  consulted: { letter: "C", label: "Consulted", hint: "asked before decisions" },
  informed: { letter: "I", label: "Informed", hint: "kept up to date" },
} as const satisfies Record<RaciRole, { letter: string; label: string; hint: string }>;

/** The RACI block on an expanded task row: defaults on top, named people below. */
export function RaciEditor({ task, people }: { task: Doc<"tasks">; people: PeopleDirectory }) {
  const update = useReportedMutation(api.tasks.update);
  const matrix = useRaciMatrix();
  const cells = matrix.cellsFor(task.phase);

  const toggled = (current: ReadonlyArray<Id<"people">>, personId: Id<"people">) =>
    current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-800/70 px-3 py-2">
        <p className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          RACI · phase {task.phase} {PHASES[task.phase].title}
        </p>
        {cells.length > 0 && (
          <p
            className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-600"
            title="The slide-16 defaults for this phase — guidance, not an assignment."
          >
            <span className="font-semibold tracking-wider uppercase">Defaults</span>
            {cells.map((cell) => (
              <span key={cell.functionId} title={cell.note}>
                <span className="font-mono text-slate-400">
                  {roleLetters(cell.roles) || "—"}
                </span>{" "}
                {cell.functionName}
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="grid gap-3 px-3 py-3 md:grid-cols-2 xl:grid-cols-4">
        <RoleSlot role="responsible" filled={task.responsiblePersonId !== undefined}>
          <PersonField
            role="responsible"
            phase={task.phase}
            value={task.responsiblePersonId}
            people={people}
            matrix={matrix}
            emptyLabel="Unassigned"
            onSelect={(responsiblePersonId) =>
              void update({ taskId: task._id, responsiblePersonId })
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
          className={`flex h-4 w-4 items-center justify-center rounded font-mono text-[10px] font-bold ${
            alarming
              ? "bg-rose-500 text-white"
              : filled
                ? "bg-slate-700 text-slate-200"
                : "bg-slate-800 text-slate-500"
          }`}
        >
          {meta.letter}
        </span>
        <span
          className={`text-[10px] font-semibold tracking-wider uppercase ${
            alarming ? "text-rose-300" : "text-slate-500"
          }`}
        >
          {meta.label}
        </span>
        <span className="hidden text-[10px] text-slate-600 xl:inline">{meta.hint}</span>
      </p>
      {children}
    </div>
  );
}

/** A single-person slot (R or A) as a click-to-open field. */
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
            <span className="truncate text-[10px] text-slate-500">
              {person.function.name}
            </span>
          )}
        </span>
      }
      triggerClass={
        alarming
          ? "border-rose-500/70 bg-rose-500/10 text-rose-200 hover:border-rose-400"
          : person === undefined
            ? "border-slate-700 bg-slate-900 text-slate-500 hover:border-slate-500"
            : "border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
      }
    />
  );
}

/** A many-person slot (C or I): chips you can drop, plus one button to add. */
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
            className="group inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-700 ring-inset transition hover:bg-slate-700 hover:text-slate-100"
          >
            {person.name}
            <span className="text-slate-600 group-hover:text-rose-300">✕</span>
          </button>
        );
      })}
      <Picker
        role={role}
        phase={phase}
        people={people}
        matrix={matrix}
        multi
        selected={selected}
        onPick={(next) => {
          if (next !== null) onToggle(next);
        }}
        trigger={<span>{selected.length === 0 ? "+ Add" : "+"}</span>}
        triggerClass="w-auto rounded-full border-dashed border-slate-700 bg-transparent px-2 py-0.5 text-slate-500 hover:border-slate-500 hover:text-slate-200"
      />
    </div>
  );
}

/**
 * The two-click assignment used by the needs-attention rail: one click opens the
 * list, one click assigns. No navigation, because the whole point of the rail is
 * to fix things without leaving it.
 */
export function AssignButton({
  task,
  people,
  role = "responsible",
}: {
  task: Doc<"tasks">;
  people: PeopleDirectory;
  role?: "responsible" | "accountable";
}) {
  const update = useReportedMutation(api.tasks.update);
  const matrix = useRaciMatrix();
  const value = role === "responsible" ? task.responsiblePersonId : task.accountablePersonId;
  const person = value === undefined ? undefined : people.byId.get(value);

  const assign = (next: Id<"people"> | null) =>
    void update(
      role === "responsible"
        ? { taskId: task._id, responsiblePersonId: next }
        : { taskId: task._id, accountablePersonId: next },
    );

  return (
    <Picker
      role={role}
      phase={task.phase}
      people={people}
      matrix={matrix}
      align="right"
      selected={value === undefined ? [] : [value]}
      onPick={assign}
      onClear={value === undefined ? undefined : () => assign(null)}
      trigger={
        <span className="whitespace-nowrap">
          {person === undefined
            ? role === "responsible"
              ? "Assign R"
              : "Set A"
            : person.name}
        </span>
      }
      triggerClass={
        person === undefined
          ? "w-auto border-rose-500 bg-rose-500/20 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-500/30"
          : "w-auto border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 hover:border-slate-500"
      }
    />
  );
}

// --- The picker itself ----------------------------------------------------

function Picker({
  role,
  phase,
  people,
  matrix,
  selected,
  onPick,
  onClear,
  trigger,
  triggerClass,
  align = "left",
  multi = false,
}: {
  role: RaciRole;
  phase: PhaseNumber;
  people: PeopleDirectory;
  matrix: RaciMatrix;
  selected: ReadonlyArray<Id<"people">>;
  onPick: (next: Id<"people"> | null) => void;
  onClear?: () => void;
  trigger: ReactNode;
  triggerClass: string;
  align?: "left" | "right";
  multi?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && box.current?.contains(target) === true) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition focus:outline-none ${triggerClass}`}
      >
        {trigger}
        <span aria-hidden className="shrink-0 text-[8px] opacity-60">
          ▼
        </span>
      </button>

      {open && (
        <PickerPanel
          role={role}
          phase={phase}
          people={people}
          matrix={matrix}
          selected={selected}
          align={align}
          multi={multi}
          onPick={(next) => {
            onPick(next);
            if (!multi) setOpen(false);
          }}
          onClear={
            onClear === undefined
              ? undefined
              : () => {
                  onClear();
                  setOpen(false);
                }
          }
        />
      )}
    </div>
  );
}

function PickerPanel({
  role,
  phase,
  people,
  matrix,
  selected,
  onPick,
  onClear,
  align,
  multi,
}: {
  role: RaciRole;
  phase: PhaseNumber;
  people: PeopleDirectory;
  matrix: RaciMatrix;
  selected: ReadonlyArray<Id<"people">>;
  onPick: (next: Id<"people">) => void;
  onClear?: () => void;
  align: "left" | "right";
  multi: boolean;
}) {
  const [search, setSearch] = useState("");
  const expected = matrix.functionsFor(phase, role);
  const chosen = new Set(selected);

  // The matrix decides the order: functions the phase expects to play this role
  // come first, so the obvious answer is the first thing under the cursor.
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = (person: Person, groupName: string) =>
      query === "" ||
      [person.name, person.title, person.organization, groupName].some(
        (field) => field !== undefined && field.toLowerCase().includes(query),
      );

    return people.byFunction
      .map((group) => ({
        ...group,
        expected: expected.has(group.functionId),
        people: group.people.filter((person) => matches(person, group.name)),
      }))
      .filter((group) => group.people.length > 0)
      .sort((a, b) => Number(b.expected) - Number(a.expected));
  }, [people.byFunction, expected, search]);

  const first = groups[0]?.people[0];
  const meta = ROLE_META[role];

  return (
    <div
      className={`absolute top-full z-40 mt-1 w-72 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/60 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-2 py-1.5">
        <span className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          {meta.label}
        </span>
        <input
          autoFocus
          value={search}
          placeholder="Search people…"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && first !== undefined) onPick(first._id);
          }}
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <div className="max-h-72 overflow-y-auto py-1">
        {onClear !== undefined && !multi && (
          <button
            type="button"
            onClick={onClear}
            className="block w-full px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-800 hover:text-rose-300"
          >
            Clear — leave {role === "responsible" ? "unassigned" : "unset"}
          </button>
        )}

        {groups.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-slate-600">
            No one matches “{search}”.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.functionId}>
            <p className="flex items-center justify-between gap-2 bg-slate-950/60 px-3 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
              <span className="truncate">{group.name}</span>
              {group.expected && (
                <span className="shrink-0 rounded bg-emerald-500/15 px-1 font-mono text-[9px] text-emerald-300">
                  phase {phase} default
                </span>
              )}
            </p>
            {group.people.map((person) => (
              <button
                key={person._id}
                type="button"
                onClick={() => onPick(person._id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-slate-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-100">
                    {person.name}
                  </span>
                  {person.title !== undefined && (
                    <span className="block truncate text-[10px] text-slate-500">
                      {person.title}
                      {person.organization !== undefined && ` · ${person.organization}`}
                    </span>
                  )}
                </span>
                {chosen.has(person._id) && (
                  <span className="shrink-0 text-[11px] text-emerald-400">✓</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
