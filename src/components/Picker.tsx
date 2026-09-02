import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Id } from "../../convex/_generated/dataModel";
import type { PhaseNumber } from "../lib/domain";
import type { PeopleDirectory, Person } from "../lib/people";
import { type RaciMatrix, type RaciRole, ROLE_META } from "../lib/raci";
import { href } from "../lib/router";

// The person picker behind every RACI slot: a trigger that reads as the current
// value, and a searchable list that opens in a portal so no clipped container
// can squash it. The slide-16 matrix orders the list — functions the phase
// expects for this role come first, everyone else behind "Show everyone".

export function Picker({
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
      if (event.key !== "Escape") return;
      setOpen(false);
      // The list held focus (it is a portal); hand it back to the trigger.
      box.current?.querySelector("button")?.focus();
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
        aria-haspopup="listbox"
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
      const next: PanelPosition =
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
            };
      // Scroll fires constantly; only a moved panel is worth a re-render.
      setPosition((current) => (samePosition(current, next) ? current : next));
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

function samePosition(a: PanelPosition | null, b: PanelPosition): boolean {
  return (
    a !== null &&
    a.left === b.left &&
    a.width === b.width &&
    a.maxHeight === b.maxHeight &&
    a.top === b.top &&
    a.bottom === b.bottom
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
  // Memoised so the grouping below can key off it; `functionsFor` builds a new Set.
  const expected = useMemo(() => matrix.functionsFor(phase, role), [matrix, phase, role]);
  const chosen = new Set(selected);

  // The matrix decides the order: functions the phase expects to play this role
  // come first, so the obvious answer is the first thing under the cursor.
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = (person: Person, groupName: string) =>
      query === "" ||
      [person.name, person.title, person.organization, groupName].some((field) =>
        field?.toLowerCase().includes(query),
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
          aria-label={`Search people for ${meta.label}`}
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
          (people.loaded && people.list.length === 0 ? (
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
          ) : !people.loaded ? (
            <p className="px-3 py-3 text-center text-xs text-ink-600">Loading people…</p>
          ) : (
            <p className="px-3 py-3 text-center text-xs text-ink-600">No one matches “{search}”.</p>
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
                aria-pressed={chosen.has(person._id)}
                onClick={() => onPick(person._id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition hover:bg-ink-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-ink-100">{person.name}</span>
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
            Show everyone · {hiddenPeople} more {hiddenPeople === 1 ? "person" : "people"} outside
            the defaults
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
