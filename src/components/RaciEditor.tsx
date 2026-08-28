import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { PHASES, responsiblesOf, roleLetters, type PhaseNumber } from "../lib/domain";
import { href } from "../lib/router";
import type { Person, PeopleDirectory } from "../lib/people";
import { useRaciMatrix, type RaciMatrix, type RaciRole } from "../lib/raci";
import { useReportedMutation } from "../lib/toast";

// Assignment, everywhere a task appears. Two rules shape this file:
//
// 1. The slide-16 matrix says which *function* is expected to act on a phase.
//    It is the pre-filled baseline — the picker opens on those functions alone,
//    with everyone else one click away — but it never makes a task assigned.
// 2. Only named Responsible people do (CONTEXT.md: Unassigned), so the R field
//    is the loud one, and picking someone is two clicks from anywhere. R takes
//    several people (shared work is real); A stays exactly one — the name you
//    chase when the task is late.

const ROLE_META = {
  responsible: { letter: "R", label: "Responsible", hint: "does the work" },
  accountable: { letter: "A", label: "Accountable", hint: "owns the outcome" },
  consulted: { letter: "C", label: "Consulted", hint: "asked before decisions" },
  informed: { letter: "I", label: "Informed", hint: "kept up to date" },
} as const satisfies Record<RaciRole, { letter: string; label: string; hint: string }>;

const toggled = (current: ReadonlyArray<Id<"people">>, personId: Id<"people">) =>
  current.includes(personId)
    ? current.filter((id) => id !== personId)
    : [...current, personId];

/** The RACI block on an expanded task row: defaults on top, named people below. */
export function RaciEditor({
  task,
  people,
}: {
  task: Doc<"tasks">;
  people: PeopleDirectory;
}) {
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
                <span className="font-mono text-ink-400">
                  {roleLetters(cell.roles) || "—"}
                </span>{" "}
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
        trigger={
          <span>
            {selected.length === 0 ? (alarming ? "Assign R" : "+ Add") : "+"}
          </span>
        }
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

  if (role === "accountable") {
    const value = task.accountablePersonId;
    const person = value === undefined ? undefined : people.byId.get(value);
    const assign = (next: Id<"people"> | null) =>
      void update({ taskId: task._id, accountablePersonId: next });

    return (
      <Picker
        role="accountable"
        phase={task.phase}
        people={people}
        matrix={matrix}
        align="right"
        selected={value === undefined ? [] : [value]}
        onPick={assign}
        onClear={value === undefined ? undefined : () => assign(null)}
        trigger={
          <span className="whitespace-nowrap">{person?.name ?? "Set A"}</span>
        }
        triggerClass={
          person === undefined
            ? "w-auto border-rose-500 bg-rose-500/20 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-500/30"
            : "w-auto border-ink-700 bg-ink-900 px-2 py-1 text-ink-200 hover:border-ink-500"
        }
      />
    );
  }

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
  closeOnPick = false,
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
  /** Close a multi picker after one pick — the fast path for a first assignment. */
  closeOnPick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPosition(box, open, align);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      // The list is a portal, so "inside" means either half of the widget.
      if (box.current?.contains(target) === true) return;
      if (panel.current?.contains(target) === true) return;
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
        className={`flex min-h-7 w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition focus:outline-none ${triggerClass}`}
      >
        {trigger}
        <span aria-hidden className="shrink-0 text-3xs opacity-60">
          ▼
        </span>
      </button>

      {/* The list lives on `document.body`. Checklist sections and the rail clip
          their own overflow, and a picker on the last row of one would otherwise
          open into a two-line sliver. */}
      {open &&
        position !== null &&
        createPortal(
          <PickerPanel
            ref={panel}
            role={role}
            phase={phase}
            people={people}
            matrix={matrix}
            selected={selected}
            position={position}
            multi={multi}
            onPick={(next) => {
              onPick(next);
              if (!multi || closeOnPick) setOpen(false);
            }}
            onClear={
              onClear === undefined
                ? undefined
                : () => {
                    onClear();
                    setOpen(false);
                  }
            }
          />,
          document.body,
        )}
    </div>
  );
}

const PANEL_WIDTH = 288;
const PANEL_HEIGHT = 340;
const GUTTER = 8;
// Matches `--spacing-header`: a list that opens upward stops at the app header
// rather than covering it.
const HEADER = 52;

type PanelPosition = {
  left: number;
  width: number;
  maxHeight: number;
} & ({ top: number; bottom?: undefined } | { bottom: number; top?: undefined });

/**
 * Where the list should sit: under the trigger by default, above it when the
 * trigger is near the bottom of the window, and always inside the viewport.
 * Recomputed on scroll because the panel is fixed and the page is not.
 */
function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  align: "left" | "right",
): PanelPosition | null {
  const [position, setPosition] = useState<PanelPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const place = () => {
      const element = anchor.current;
      if (element === null) return;
      const rect = element.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2);
      const wanted = align === "right" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(GUTTER, wanted), window.innerWidth - width - GUTTER);

      const below = window.innerHeight - rect.bottom - GUTTER;
      const above = rect.top - GUTTER - HEADER;
      setPosition(
        below < Math.min(PANEL_HEIGHT, above)
          ? {
              left,
              width,
              bottom: window.innerHeight - rect.top + 4,
              maxHeight: Math.min(PANEL_HEIGHT, above),
            }
          : {
              left,
              width,
              top: rect.bottom + 4,
              maxHeight: Math.min(PANEL_HEIGHT, below),
            },
      );
    };

    place();
    // Capture phase: the page scrolls, but so can a sidebar or a table.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, open, align]);

  return position;
}

function PickerPanel({
  role,
  phase,
  people,
  matrix,
  selected,
  onPick,
  onClear,
  position,
  multi,
  ref,
}: {
  role: RaciRole;
  phase: PhaseNumber;
  people: PeopleDirectory;
  matrix: RaciMatrix;
  selected: ReadonlyArray<Id<"people">>;
  onPick: (next: Id<"people">) => void;
  onClear?: () => void;
  position: PanelPosition;
  multi: boolean;
  ref: RefObject<HTMLDivElement | null>;
}) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
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

  // Soft filter: the list opens on the functions the matrix expects for this
  // phase + role. Guidance, not law — "Show everyone" is one click, and a
  // search always covers the whole directory.
  const searching = search.trim() !== "";
  const filtering =
    !showAll && !searching && expected.size > 0 && groups.some((group) => group.expected);
  const visible = filtering ? groups.filter((group) => group.expected) : groups;
  const hiddenPeople = filtering
    ? groups
        .filter((group) => !group.expected)
        .reduce((count, group) => count + group.people.length, 0)
    : 0;

  const first = visible[0]?.people[0];
  const meta = ROLE_META[role];

  return (
    <div
      ref={ref}
      style={position}
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl shadow-black/50"
    >
      <div className="flex items-center gap-2 border-b border-ink-800 px-2 py-1.5">
        <span className="text-3xs font-semibold tracking-wider text-ink-500 uppercase">
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
          className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-950 px-1.5 py-0.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-sand-500 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {onClear !== undefined && !multi && (
          <button
            type="button"
            onClick={onClear}
            className="block w-full px-3 py-1.5 text-left text-xs text-ink-500 hover:bg-ink-800 hover:text-rose-300"
          >
            Clear — leave {role === "responsible" ? "unassigned" : "unset"}
          </button>
        )}

        {visible.length === 0 &&
          (people.list.length === 0 ? (
            // Nothing to pick from at all: say where people come from, because
            // an empty picker is otherwise indistinguishable from a broken one.
            <div className="px-3 py-3 text-center">
              <p className="text-xs text-ink-300">Nobody in the directory yet</p>
              <p className="mt-1 text-2xs text-ink-500">
                Add people in Manage and they show up here, grouped by function.
              </p>
              <a
                href={href({ name: "manage" })}
                className="mt-1.5 inline-block text-2xs font-medium text-sand-300 hover:text-sand-200"
              >
                Open Manage →
              </a>
            </div>
          ) : (
            <p className="px-3 py-3 text-center text-xs text-ink-600">
              No one matches “{search}”.
            </p>
          ))}

        {visible.map((group) => (
          <div key={group.functionId}>
            <p className="flex items-center justify-between gap-2 bg-ink-950/60 px-3 py-1 text-3xs font-semibold tracking-wider text-ink-500 uppercase">
              <span className="truncate">{group.name}</span>
              {group.expected && (
                <span className="shrink-0 rounded bg-sand-400/15 px-1 font-mono text-3xs text-sand-300">
                  phase {phase} default
                </span>
              )}
            </p>
            {group.people.map((person) => (
              <button
                key={person._id}
                type="button"
                onClick={() => onPick(person._id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-ink-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-ink-100">
                    {person.name}
                  </span>
                  {person.title !== undefined && (
                    <span className="block truncate text-3xs text-ink-500">
                      {person.title}
                      {person.organization !== undefined && ` · ${person.organization}`}
                    </span>
                  )}
                </span>
                {chosen.has(person._id) && (
                  <span className="shrink-0 text-2xs text-sand-300">✓</span>
                )}
              </button>
            ))}
          </div>
        ))}

        {hiddenPeople > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="block w-full border-t border-ink-800/70 px-3 py-1.5 text-left text-2xs font-medium text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          >
            Show everyone · {hiddenPeople} more{" "}
            {hiddenPeople === 1 ? "person" : "people"} outside the defaults
          </button>
        )}
        {showAll && !searching && expected.size > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="block w-full border-t border-ink-800/70 px-3 py-1.5 text-left text-2xs text-ink-500 transition hover:bg-ink-800 hover:text-ink-200"
          >
            Show only the phase-default functions
          </button>
        )}
      </div>
    </div>
  );
}
