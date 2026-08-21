import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { InlineNumber, InlineText } from "../components/inline";
import { Breadcrumb, PageHeader } from "../components/page";
import {
  Button,
  ConfirmButton,
  EmptyState,
  Panel,
  Pill,
  Skeleton,
  inputClass,
} from "../components/ui";
import { ALL_PHASES, PHASES, type PhaseNumber } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { useReportedMutation } from "../lib/toast";

// Reference data, all editable in one place: chains, brands, people, functions,
// plan years and the task template. Nothing here is deleted out from under
// something that still uses it — the mutations refuse and say what is in the way.

export function ManageView({ people }: { people: PeopleDirectory }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "Manage" }]} />}
        title="Reference data"
        meta={
          <span className="text-ink-500">
            Chains, brands and people feed every plan and promotion. Edit any value in
            place.
          </span>
        }
      />
      <ChainsPanel />
      <BrandsPanel />
      <PeoplePanel people={people} />
      <SeasonsPanel />
      <TaskTemplatesPanel />
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink-800/70 px-4 py-2.5 last:border-b-0 hover:bg-ink-800/30">
      {children}
    </div>
  );
}

/** Panel chrome with placeholder rows, so a panel never pops into existence. */
function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-ink-800/70 px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 min-w-0 flex-1" />
        </div>
      ))}
    </div>
  );
}

function AddRow({
  placeholder,
  label,
  onAdd,
  children,
}: {
  placeholder: string;
  label: string;
  onAdd: (value: string) => Promise<boolean>;
  children?: (props: { disabled: boolean }) => ReactNode;
}) {
  const [value, setValue] = useState("");

  const submit = async () => {
    if (value.trim() === "") return;
    if (await onAdd(value)) setValue("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-ink-800 bg-ink-950/40 px-4 py-2.5">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        className={`${inputClass} w-full sm:max-w-xs`}
      />
      {children?.({ disabled: value.trim() === "" })}
      <Button variant="primary" onClick={submit} disabled={value.trim() === ""}>
        {label}
      </Button>
    </div>
  );
}

function ChainsPanel() {
  const chains = useQuery(api.chains.list);
  const create = useReportedMutation(api.chains.create);
  const update = useReportedMutation(api.chains.update);
  const remove = useReportedMutation(api.chains.remove);

  return (
    <Panel title="Chains" subtitle="Retail accounts a plan can be built for.">
      {chains === undefined ? (
        <RowsSkeleton />
      ) : chains.length === 0 ? (
        <EmptyState title="No chains yet">
          A chain is a retail account — Safeway, Kroger, Ralphs. Add one and it becomes
          available to plan against in every season.
        </EmptyState>
      ) : (
        chains.map((chain) => (
          <Row key={chain._id}>
            <div className="w-full text-sm font-medium text-ink-100 sm:w-56 sm:shrink-0">
              <InlineText
                value={chain.name}
                onCommit={(name) => void update({ chainId: chain._id, name })}
              />
            </div>
            <div className="min-w-40 flex-1 text-xs text-ink-400">
              <InlineText
                value={chain.notes}
                placeholder="Add a note…"
                onCommit={(notes) => void update({ chainId: chain._id, notes })}
              />
            </div>
            <ConfirmButton onConfirm={() => void remove({ chainId: chain._id })} />
          </Row>
        ))
      )}
      <AddRow
        placeholder="Kroger"
        label="Add chain"
        onAdd={async (name) => (await create({ name })).ok}
      />
    </Panel>
  );
}

function BrandsPanel() {
  const brands = useQuery(api.brands.list);
  const create = useReportedMutation(api.brands.create);
  const update = useReportedMutation(api.brands.update);
  const remove = useReportedMutation(api.brands.remove);

  return (
    <Panel
      title="Brands"
      subtitle="What is being promoted. Placeholder entries stand in until the real portfolio lands."
    >
      {brands === undefined ? (
        <RowsSkeleton />
      ) : brands.length === 0 ? (
        <EmptyState title="No brands yet">
          Brands are what a promotion is for. Add the ones you know and mark them
          confirmed once the real portfolio lands.
        </EmptyState>
      ) : (
        brands.map((brand) => (
          <Row key={brand._id}>
            <div className="w-full text-sm font-medium text-ink-100 sm:w-56 sm:shrink-0">
              <InlineText
                value={brand.name}
                onCommit={(name) => void update({ brandId: brand._id, name })}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                void update({ brandId: brand._id, isPlaceholder: !brand.isPlaceholder })
              }
              title="Toggle placeholder"
            >
              <Pill
                className={
                  brand.isPlaceholder
                    ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 ring-inset"
                    : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 ring-inset"
                }
              >
                {brand.isPlaceholder ? "Placeholder" : "Confirmed"}
              </Pill>
            </button>
            <div className="min-w-40 flex-1 text-xs text-ink-400">
              <InlineText
                value={brand.notes}
                placeholder="Add a note…"
                onCommit={(notes) => void update({ brandId: brand._id, notes })}
              />
            </div>
            <ConfirmButton onConfirm={() => void remove({ brandId: brand._id })} />
          </Row>
        ))
      )}
      <AddRow
        placeholder="Fetzer"
        label="Add brand"
        onAdd={async (name) => (await create({ name })).ok}
      />
    </Panel>
  );
}

const selectClass =
  "h-8 cursor-pointer rounded-md border border-ink-700 bg-ink-900 px-2 text-xs text-ink-200 transition hover:border-ink-500 focus:border-sand-500 focus:outline-none";

function PeoplePanel({ people }: { people: PeopleDirectory }) {
  const functions = useQuery(api.people.listFunctions);
  const create = useReportedMutation(api.people.create);
  const update = useReportedMutation(api.people.update);
  const remove = useReportedMutation(api.people.remove);
  const renameFunction = useReportedMutation(api.people.renameFunction);
  const [newFunctionId, setNewFunctionId] = useState<Id<"functions"> | "">("");

  const targetFunction = newFunctionId === "" ? functions?.[0]?._id : newFunctionId;

  return (
    <>
      <Panel
        title="People"
        subtitle="Named humans. Only a named person makes a task assigned — a function never does."
      >
        {functions === undefined ? (
          <RowsSkeleton rows={4} />
        ) : people.list.length === 0 ? (
          <EmptyState title="Nobody in the directory yet">
            Add the humans behind the functions. Until you do, every task on every
            checklist counts as unassigned.
          </EmptyState>
        ) : (
          people.list.map((person) => (
            <Row key={person._id}>
              <div className="w-full text-sm font-medium text-ink-100 sm:w-48 sm:shrink-0">
                <InlineText
                  value={person.name}
                  onCommit={(name) => void update({ personId: person._id, name })}
                />
              </div>
              <select
                aria-label={`Function for ${person.name}`}
                value={person.functionId}
                onChange={(event) => {
                  const next = functions.find((fn) => fn._id === event.target.value);
                  if (next !== undefined) {
                    void update({ personId: person._id, functionId: next._id });
                  }
                }}
                className={`${selectClass} w-56 shrink-0`}
              >
                {functions.map((fn) => (
                  <option key={fn._id} value={fn._id}>
                    {fn.name}
                  </option>
                ))}
              </select>
              <div className="min-w-32 flex-1 text-xs text-ink-400">
                <InlineText
                  value={person.title}
                  placeholder="Title…"
                  onCommit={(title) => void update({ personId: person._id, title })}
                />
              </div>
              <div className="min-w-32 flex-1 text-xs text-ink-400 sm:w-48 sm:flex-none sm:shrink-0">
                <InlineText
                  value={person.organization}
                  placeholder="Organization…"
                  onCommit={(organization) =>
                    void update({ personId: person._id, organization })
                  }
                />
              </div>
              <ConfirmButton onConfirm={() => void remove({ personId: person._id })} />
            </Row>
          ))
        )}
        <AddRow
          placeholder="Marisol Vega"
          label="Add person"
          onAdd={async (name) => {
            if (targetFunction === undefined) return false;
            return (await create({ name, functionId: targetFunction })).ok;
          }}
        >
          {() => (
            <select
              aria-label="Function for the new person"
              value={targetFunction ?? ""}
              onChange={(event) => {
                const next = functions?.find((fn) => fn._id === event.target.value);
                setNewFunctionId(next?._id ?? "");
              }}
              className={selectClass}
            >
              {(functions ?? []).map((fn) => (
                <option key={fn._id} value={fn._id}>
                  {fn.name}
                </option>
              ))}
            </select>
          )}
        </AddRow>
      </Panel>

      <Panel
        title="Functions"
        subtitle="The stakeholder buckets from the deck. Renameable; the set itself is fixed."
      >
        {functions === undefined ? (
          <RowsSkeleton rows={6} />
        ) : (
          functions.map((fn) => (
            <Row key={fn._id}>
              <div className="w-full text-sm text-ink-100 sm:w-72 sm:shrink-0">
                <InlineText
                  value={fn.name}
                  onCommit={(name) => void renameFunction({ functionId: fn._id, name })}
                />
              </div>
              <Pill
                className={
                  fn.kind === "internal"
                    ? "bg-ink-800 text-ink-300"
                    : "bg-sky-500/15 text-sky-300"
                }
              >
                {fn.kind}
              </Pill>
              <span className="flex-1 text-xs text-ink-600">
                {people.list.filter((person) => person.functionId === fn._id).length}{" "}
                people
              </span>
            </Row>
          ))
        )}
      </Panel>
    </>
  );
}

function SeasonsPanel() {
  const seasons = useQuery(api.seasons.list);
  const create = useReportedMutation(api.seasons.create);
  const update = useReportedMutation(api.seasons.update);
  const remove = useReportedMutation(api.seasons.remove);

  return (
    <Panel title="Plan years" subtitle="One per calendar year. Phase 0 hangs off each one.">
      {seasons === undefined ? (
        <RowsSkeleton rows={2} />
      ) : seasons.length === 0 ? (
        <EmptyState title="No plan years yet">
          A plan year is what every plan and promotion hangs off. Add the year below and
          the phase-0 template checklist comes with it.
        </EmptyState>
      ) : (
        seasons.map((season) => (
          <Row key={season._id}>
            <span className="w-16 shrink-0 font-mono text-xs text-ink-500">
              {season.year}
            </span>
            <div className="w-40 shrink-0 text-sm font-medium text-ink-100">
              <InlineText
                value={season.label}
                onCommit={(label) => void update({ seasonId: season._id, label })}
              />
            </div>
            <div className="min-w-40 flex-1 text-xs text-ink-400">
              <InlineText
                value={season.notes}
                placeholder="Add a note…"
                onCommit={(notes) => void update({ seasonId: season._id, notes })}
              />
            </div>
            <ConfirmButton onConfirm={() => void remove({ seasonId: season._id })} />
          </Row>
        ))
      )}
      <AddRow
        placeholder="2027"
        label="Add year"
        onAdd={async (value) => {
          const year = Number(value.trim());
          if (!Number.isInteger(year)) return false;
          return (await create({ year })).ok;
        }}
      />
    </Panel>
  );
}

// Which tier a phase's template stamps onto — shown so an edit here is
// understood as "this changes what a new X starts with".
const TIER_TAG: Record<"season" | "chainPlan" | "promotion", string> = {
  season: "new plan years",
  chainPlan: "new chain plans",
  promotion: "new promotions",
};

const tierOf = (phase: PhaseNumber) =>
  phase === 0 ? "season" : phase <= 4 ? "chainPlan" : "promotion";

function TaskTemplatesPanel() {
  const templates = useQuery(api.taskTemplates.list);
  const create = useReportedMutation(api.taskTemplates.create);
  const update = useReportedMutation(api.taskTemplates.update);
  const remove = useReportedMutation(api.taskTemplates.remove);
  const move = useReportedMutation(api.taskTemplates.move);
  const loadDefaults = useReportedMutation(api.taskTemplates.loadDefaults);

  return (
    <Panel
      title="Task templates"
      subtitle="The default checklist stamped onto every new plan year, chain plan and promotion — undated, unassigned. Edits change what future creations start with; existing checklists keep theirs."
    >
      {templates === undefined ? (
        <RowsSkeleton rows={6} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No template yet"
          action={
            <Button
              variant="primary"
              size="md"
              onClick={() => void loadDefaults({})}
            >
              Load the deck's default menu
            </Button>
          }
        >
          Without a template, every new plan year, chain plan and promotion starts with a
          blank checklist. The default menu is the deck's slide-11 list plus the phase 0–4
          items.
        </EmptyState>
      ) : (
        ALL_PHASES.map((phase) => {
          const rows = templates.filter((row) => row.phase === phase);
          return (
            <div key={phase}>
              <p className="flex items-baseline justify-between gap-2 border-b border-ink-800/70 bg-ink-950/40 px-4 py-1.5">
                <span className="text-3xs font-semibold tracking-wider text-ink-400 uppercase">
                  Phase {phase} · {PHASES[phase].title}
                </span>
                <span className="text-3xs text-ink-600">
                  stamped onto {TIER_TAG[tierOf(phase)]}
                </span>
              </p>
              {rows.map((row, index) => (
                <TemplateRow
                  key={row._id}
                  row={row}
                  isFirst={index === 0}
                  isLast={index === rows.length - 1}
                  onUpdate={update}
                  onRemove={remove}
                  onMove={move}
                />
              ))}
              <AddRow
                placeholder="New template task…"
                label="Add"
                onAdd={async (name) => (await create({ phase, name })).ok}
              />
            </div>
          );
        })
      )}
    </Panel>
  );
}

function TemplateRow({
  row,
  isFirst,
  isLast,
  onUpdate,
  onRemove,
  onMove,
}: {
  row: Doc<"taskTemplates">;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: ReturnType<typeof useReportedMutation<typeof api.taskTemplates.update>>;
  onRemove: ReturnType<typeof useReportedMutation<typeof api.taskTemplates.remove>>;
  onMove: ReturnType<typeof useReportedMutation<typeof api.taskTemplates.move>>;
}) {
  return (
    <Row>
      <div className="w-full text-sm font-medium text-ink-100 sm:w-56 sm:shrink-0">
        <InlineText
          value={row.name}
          onCommit={(name) => void onUpdate({ templateId: row._id, name })}
        />
      </div>
      <div className="min-w-32 flex-1 text-xs text-ink-400">
        <InlineText
          value={row.spec}
          placeholder="Add a spec…"
          onCommit={(spec) => void onUpdate({ templateId: row._id, spec })}
        />
      </div>
      <div className="w-36 shrink-0 text-xs text-ink-500">
        <InlineText
          value={row.category}
          placeholder="Ungrouped"
          title="Category — the slide-11 group heading"
          onCommit={(category) => void onUpdate({ templateId: row._id, category })}
        />
      </div>
      <div className="w-12 shrink-0 text-xs text-ink-400">
        <InlineNumber
          value={row.quantity}
          onCommit={(quantity) => void onUpdate({ templateId: row._id, quantity })}
        />
      </div>
      <div className="flex shrink-0 gap-0.5">
        <Button
          variant="ghost"
          size="xs"
          className="px-1"
          disabled={isFirst}
          title="Move up"
          aria-label="Move up"
          onClick={() => void onMove({ templateId: row._id, direction: "up" })}
        >
          ↑
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="px-1"
          disabled={isLast}
          title="Move down"
          aria-label="Move down"
          onClick={() => void onMove({ templateId: row._id, direction: "down" })}
        >
          ↓
        </Button>
        <ConfirmButton onConfirm={() => void onRemove({ templateId: row._id })} />
      </div>
    </Row>
  );
}
