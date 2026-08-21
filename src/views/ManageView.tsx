import { useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { InlineText } from "../components/inline";
import { Breadcrumb, Loading, PageHeader } from "../components/page";
import { Button, ConfirmButton, EmptyState, Panel, Pill, inputClass } from "../components/ui";
import type { PeopleDirectory } from "../lib/people";
import { useReportedMutation } from "../lib/toast";

// Reference data, all editable in one place: chains, brands, people, functions
// and seasons. Nothing here is deleted out from under something that still uses
// it — the mutations refuse and say what is in the way.

export function ManageView({ people }: { people: PeopleDirectory }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "Manage" }]} />}
        title="Reference data"
        meta={
          <span className="text-slate-500">
            Chains, brands and people feed every plan and promotion. Edit any value in
            place.
          </span>
        }
      />
      <ChainsPanel />
      <BrandsPanel />
      <PeoplePanel people={people} />
      <SeasonsPanel />
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-800/70 px-4 py-2 last:border-b-0 hover:bg-slate-800/30">
      {children}
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
    <div className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-2.5">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
        className={`${inputClass} max-w-xs`}
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

  if (chains === undefined) return <Loading what="chains" />;

  return (
    <Panel title="Chains" subtitle="Retail accounts a plan can be built for.">
      {chains.length === 0 ? (
        <EmptyState>No chains yet.</EmptyState>
      ) : (
        chains.map((chain) => (
          <Row key={chain._id}>
            <div className="w-56 shrink-0 text-sm font-medium text-slate-100">
              <InlineText
                value={chain.name}
                onCommit={(name) => void update({ chainId: chain._id, name })}
              />
            </div>
            <div className="min-w-0 flex-1 text-xs text-slate-400">
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

  if (brands === undefined) return <Loading what="brands" />;

  return (
    <Panel
      title="Brands"
      subtitle="What is being promoted. Placeholder entries stand in until the real portfolio lands."
    >
      {brands.length === 0 ? (
        <EmptyState>No brands yet.</EmptyState>
      ) : (
        brands.map((brand) => (
          <Row key={brand._id}>
            <div className="w-56 shrink-0 text-sm font-medium text-slate-100">
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
            <div className="min-w-0 flex-1 text-xs text-slate-400">
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

function PeoplePanel({ people }: { people: PeopleDirectory }) {
  const functions = useQuery(api.people.listFunctions);
  const create = useReportedMutation(api.people.create);
  const update = useReportedMutation(api.people.update);
  const remove = useReportedMutation(api.people.remove);
  const renameFunction = useReportedMutation(api.people.renameFunction);
  const [newFunctionId, setNewFunctionId] = useState<Id<"functions"> | "">("");

  if (functions === undefined) return <Loading what="people" />;

  const targetFunction = newFunctionId === "" ? functions[0]?._id : newFunctionId;

  return (
    <>
      <Panel
        title="People"
        subtitle="Named humans. Only a named person makes a task assigned — a function never does."
      >
        {people.list.length === 0 ? (
          <EmptyState>No people yet.</EmptyState>
        ) : (
          people.list.map((person) => (
            <Row key={person._id}>
              <div className="w-48 shrink-0 text-sm font-medium text-slate-100">
                <InlineText
                  value={person.name}
                  onCommit={(name) => void update({ personId: person._id, name })}
                />
              </div>
              <select
                value={person.functionId}
                onChange={(event) => {
                  const next = functions.find((fn) => fn._id === event.target.value);
                  if (next !== undefined) {
                    void update({ personId: person._id, functionId: next._id });
                  }
                }}
                className="w-56 shrink-0 cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 hover:border-slate-500 focus:border-emerald-500 focus:outline-none"
              >
                {functions.map((fn) => (
                  <option key={fn._id} value={fn._id}>
                    {fn.name}
                  </option>
                ))}
              </select>
              <div className="min-w-0 flex-1 text-xs text-slate-400">
                <InlineText
                  value={person.title}
                  placeholder="Title…"
                  onCommit={(title) => void update({ personId: person._id, title })}
                />
              </div>
              <div className="w-48 shrink-0 text-xs text-slate-400">
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
              value={targetFunction ?? ""}
              onChange={(event) => {
                const next = functions.find((fn) => fn._id === event.target.value);
                setNewFunctionId(next?._id ?? "");
              }}
              className="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500 focus:outline-none"
            >
              {functions.map((fn) => (
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
        {functions.map((fn) => (
          <Row key={fn._id}>
            <div className="w-72 shrink-0 text-sm text-slate-100">
              <InlineText
                value={fn.name}
                onCommit={(name) => void renameFunction({ functionId: fn._id, name })}
              />
            </div>
            <Pill
              className={
                fn.kind === "internal"
                  ? "bg-slate-800 text-slate-300"
                  : "bg-sky-500/15 text-sky-300"
              }
            >
              {fn.kind}
            </Pill>
            <span className="flex-1 text-xs text-slate-600">
              {people.list.filter((person) => person.functionId === fn._id).length} people
            </span>
          </Row>
        ))}
      </Panel>
    </>
  );
}

function SeasonsPanel() {
  const seasons = useQuery(api.seasons.list);
  const create = useReportedMutation(api.seasons.create);
  const update = useReportedMutation(api.seasons.update);
  const remove = useReportedMutation(api.seasons.remove);

  if (seasons === undefined) return <Loading what="seasons" />;

  return (
    <Panel title="Seasons" subtitle="Planning years. Phase 0 hangs off each one.">
      {seasons.map((season) => (
        <Row key={season._id}>
          <span className="w-16 shrink-0 font-mono text-xs text-slate-500">
            {season.year}
          </span>
          <div className="w-40 shrink-0 text-sm font-medium text-slate-100">
            <InlineText
              value={season.label}
              onCommit={(label) => void update({ seasonId: season._id, label })}
            />
          </div>
          <div className="min-w-0 flex-1 text-xs text-slate-400">
            <InlineText
              value={season.notes}
              placeholder="Add a note…"
              onCommit={(notes) => void update({ seasonId: season._id, notes })}
            />
          </div>
          <ConfirmButton onConfirm={() => void remove({ seasonId: season._id })} />
        </Row>
      ))}
      <AddRow
        placeholder="2027"
        label="Add season"
        onAdd={async (value) => {
          const year = Number(value.trim());
          if (!Number.isInteger(year)) return false;
          return (await create({ year })).ok;
        }}
      />
    </Panel>
  );
}
