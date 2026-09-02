import type { FunctionReturnType } from "convex/server";
import { type FormEvent, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { TaskOwner } from "../../convex/model";
import { isOverdue } from "../lib/dates";
import { PHASES, type PhaseNumber, roleLetters } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { useReportedMutation } from "../lib/toast";
import type { Editors } from "./page";
import { TaskRow } from "./TaskRow";
import { Button, EmptyState, inputClass } from "./ui";

// One phase of the Integrated Commercial Cycle, rendered as a checklist section:
// header (what the phase is, how much of it is done, who owns it by default),
// the rows, and a freeform add line.

type RaciDefault = NonNullable<
  FunctionReturnType<typeof api.promotions.get>
>["raciDefaults"][number];

export function PhaseChecklist({
  phase,
  owner,
  tasks,
  today,
  people,
  editors,
  raciDefault,
  focusTaskId,
}: {
  phase: PhaseNumber;
  owner: TaskOwner;
  tasks: readonly Doc<"tasks">[];
  today: string;
  people: PeopleDirectory;
  /** Names for the last-modified stamps on these rows (convex/access.ts). */
  editors: Editors;
  raciDefault?: RaciDefault;
  /** The row a needs-attention link pointed at, if it lives in this phase. */
  focusTaskId?: Id<"tasks">;
}) {
  const rows = tasks.filter((task) => task.phase === phase);
  const meta = PHASES[phase];

  const delivered = rows.filter((task) => task.status === "delivered").length;
  const blocked = rows.filter((task) => task.status === "blocked").length;
  const overdue = rows.filter((task) => isOverdue(task.eta, task.status, today)).length;
  const progress = rows.length === 0 ? 0 : Math.round((delivered / rows.length) * 100);

  const groups = groupByCategory(rows);
  // Held here rather than inside the form, so an empty checklist's own button
  // is the same button as the one under a full one.
  const [adding, setAdding] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50">
      <header className="border-b border-ink-800 bg-ink-900/80 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold text-ink-100">
            <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-2xs text-ink-400">
              Phase {phase}
            </span>
            {meta.title}
          </h3>
          <div className="flex items-center gap-3 text-2xs">
            {blocked > 0 && <span className="font-semibold text-rose-300">{blocked} blocked</span>}
            {overdue > 0 && <span className="font-semibold text-amber-300">{overdue} overdue</span>}
            <span className="text-ink-500">
              {delivered}/{rows.length} delivered
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-500">{meta.summary}</p>
        {raciDefault !== undefined && raciDefault.cells.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-600">
            <span className="font-semibold tracking-wider uppercase">Default RACI</span>
            {raciDefault.cells.map((cell) => (
              <span key={cell.functionName} title={cell.note}>
                <span className="font-mono text-ink-400">{roleLetters(cell.roles) || "—"}</span>{" "}
                {cell.functionName}
                {cell.note !== undefined && <span className="text-ink-500"> *</span>}
              </span>
            ))}
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title={`Nothing on the phase ${phase} checklist`}
          action={
            adding ? undefined : (
              <Button variant="primary" size="md" onClick={() => setAdding(true)}>
                Add the first task
              </Button>
            )
          }
        >
          One line per thing that has to be true before this phase is done — a name, a spec, a
          quantity, an ETA — and a named person on each of them.
        </EmptyState>
      ) : (
        groups.map((group) => (
          <div key={group.label ?? "__ungrouped"}>
            {group.label !== null && (
              <p className="border-b border-ink-800/70 bg-ink-950/40 px-4 py-1 text-3xs font-semibold tracking-wider text-ink-500 uppercase">
                {group.label}
              </p>
            )}
            <ul>
              {group.tasks.map((task, index) => (
                <TaskRow
                  key={task._id}
                  task={task}
                  today={today}
                  people={people}
                  editors={editors}
                  // Moves stay inside the category group (the server swaps
                  // within it too), so the ends are the group's ends.
                  isFirst={index === 0}
                  isLast={index === group.tasks.length - 1}
                  focused={task._id === focusTaskId}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      <AddTaskForm phase={phase} owner={owner} open={adding} onOpen={setAdding} />
    </section>
  );
}

/**
 * Adding work is deliberately freeform — a name and a line of spec text. The
 * specs vary too much per chain ("32 in", "half-pallet Halloween wrap") for a
 * fixed dropdown to survive contact with a real promotion.
 */
function AddTaskForm({
  phase,
  owner,
  open,
  onOpen,
}: {
  phase: PhaseNumber;
  owner: TaskOwner;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const create = useReportedMutation(api.tasks.create);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [quantity, setQuantity] = useState("");
  const [eta, setEta] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;

    const created = await create({
      owner,
      phase,
      name,
      spec: spec === "" ? undefined : spec,
      quantity: quantity.trim() === "" ? null : Number(quantity),
      eta: eta === "" ? null : eta,
    });
    if (!created.ok) return;

    setName("");
    setSpec("");
    setQuantity("");
    setEta("");
  };

  if (!open) {
    return (
      <div className="border-t border-ink-800/70 px-4 py-2">
        <Button variant="ghost" size="xs" onClick={() => onOpen(true)}>
          + Add task to phase {phase}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 border-t border-ink-800/70 bg-ink-950/40 px-4 py-3"
    >
      <label className="min-w-48 flex-1">
        <span className="mb-1 block text-3xs font-semibold tracking-wider text-ink-500 uppercase">
          Task
        </span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Shelf talkers"
          className={inputClass}
        />
      </label>
      <label className="min-w-48 flex-1">
        <span className="mb-1 block text-3xs font-semibold tracking-wider text-ink-500 uppercase">
          Spec
        </span>
        <input
          value={spec}
          onChange={(event) => setSpec(event.target.value)}
          placeholder="32 in, Halloween creative"
          className={inputClass}
        />
      </label>
      <label className="w-20">
        <span className="mb-1 block text-3xs font-semibold tracking-wider text-ink-500 uppercase">
          Qty
        </span>
        <input
          value={quantity}
          inputMode="numeric"
          onChange={(event) => setQuantity(event.target.value)}
          className={`${inputClass} text-right tabular-nums`}
        />
      </label>
      <label className="w-40">
        <span className="mb-1 block text-3xs font-semibold tracking-wider text-ink-500 uppercase">
          ETA
        </span>
        <input
          type="date"
          value={eta}
          onChange={(event) => setEta(event.target.value)}
          className={inputClass}
        />
      </label>
      <Button type="submit" variant="primary" size="md" disabled={name.trim() === ""}>
        Add
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={() => {
          onOpen(false);
          setName("");
        }}
      >
        Done
      </Button>
    </form>
  );
}

/**
 * Slide-11 groups rows under headings ("Retail Mktg Mechanics"). Categories are
 * optional free text, so tasks keep their checklist order and only pick up a
 * heading where one exists.
 */
function groupByCategory(tasks: readonly Doc<"tasks">[]) {
  const groups: Array<{ label: string | null; tasks: Doc<"tasks">[] }> = [];
  for (const task of tasks) {
    const label = task.category ?? null;
    const current = groups.find((group) => group.label === label);
    if (current === undefined) groups.push({ label, tasks: [task] });
    else current.tasks.push(task);
  }
  return groups;
}
