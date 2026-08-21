import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhaseChecklist } from "../components/PhaseChecklist";
import { RollupChips, RollupTiles } from "../components/Rollup";
import { Breadcrumb, Loading, MetaItem, NotFound, PageHeader } from "../components/page";
import { InlineDate, InlineSelect, InlineText } from "../components/inline";
import { Button, ConfirmButton, EmptyState, Field, Modal, Panel, inputClass } from "../components/ui";
import { formatDay, formatRange } from "../lib/dates";
import { CHAIN_PLAN_PHASES, PHASES, toPhase } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { href, navigate } from "../lib/router";
import { useReportedMutation } from "../lib/toast";

// Tier two: one chain x one season. Phases 1-4 are the road to an agreement;
// once there is one, the promotions underneath carry phases 5-8.

export function ChainPlanView({
  chainPlanId,
  today,
  people,
}: {
  chainPlanId: Id<"chainPlans">;
  today: string;
  people: PeopleDirectory;
}) {
  const data = useQuery(api.chainPlans.get, { chainPlanId, today });
  const update = useReportedMutation(api.chainPlans.update);
  const remove = useReportedMutation(api.chainPlans.remove);
  const [creating, setCreating] = useState(false);

  if (data === undefined) return <Loading what="the chain plan" />;
  if (data === null) return <NotFound what="chain plan" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Breadcrumb
            trail={[
              { label: `Season ${data.season.label}`, to: { name: "season", seasonId: data.season._id } },
              { label: "Chain plan" },
            ]}
          />
        }
        title={data.chain.name}
        actions={
          <>
            <Button variant="primary" size="md" onClick={() => setCreating(true)}>
              + Promotion
            </Button>
            <ConfirmButton
              size="md"
              label="Delete plan"
              confirmLabel="Delete this plan?"
              onConfirm={async () => {
                const removed = await remove({ chainPlanId });
                if (removed.ok) navigate({ name: "season", seasonId: data.season._id });
              }}
            />
          </>
        }
        meta={
          <>
            <MetaItem label="Current phase">
              <InlineSelect
                value={String(data.plan.currentPhase)}
                options={CHAIN_PLAN_PHASES.map((phase) => ({
                  value: String(phase),
                  label: `${phase} · ${PHASES[phase].title}`,
                }))}
                onChange={(value) => {
                  const phase = toPhase(Number(value));
                  if (phase !== null) void update({ chainPlanId, currentPhase: phase });
                }}
              />
            </MetaItem>
            <MetaItem label="JBP date">
              <InlineDate
                value={data.plan.jbpDate}
                placeholder="Not scheduled"
                onCommit={(jbpDate) => void update({ chainPlanId, jbpDate })}
                render={(value) => formatDay(value, today)}
                className="whitespace-nowrap"
              />
            </MetaItem>
            <MetaItem label="Promotions">{data.promotions.length}</MetaItem>
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-slate-400">
          <InlineText
            value={data.plan.notes}
            multiline
            placeholder="Add a note about this plan…"
            onCommit={(notes) => void update({ chainPlanId, notes })}
          />
        </div>
      </PageHeader>

      <RollupTiles rollup={data.rollup} />

      <Panel
        title="Promotions"
        subtitle="Approved programs under this plan. Each carries its own phases 5–8."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            + Promotion
          </Button>
        }
      >
        {data.promotions.length === 0 ? (
          <EmptyState>
            No promotions yet. Add one once the agreement covers a program.
          </EmptyState>
        ) : (
          <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-3">
            {data.promotions.map((node) => (
              <a
                key={node.promotion._id}
                href={href({ name: "promotion", promotionId: node.promotion._id })}
                className="bg-slate-900 p-4 transition hover:bg-slate-800/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {node.promotion.name}
                  </h3>
                  <RollupChips rollup={node.rollup} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatRange(node.promotion.startDate, node.promotion.endDate)}
                  {node.promotion.storeCount !== undefined &&
                    ` · ${node.promotion.storeCount} stores`}
                </p>
                <p className="mt-3 text-[11px] text-slate-500">
                  Phase {node.promotion.currentPhase} ·{" "}
                  {PHASES[node.promotion.currentPhase].title}
                </p>
              </a>
            ))}
          </div>
        )}
      </Panel>

      {CHAIN_PLAN_PHASES.map((phase) => (
        <PhaseChecklist
          key={phase}
          phase={phase}
          owner={{ tier: "chainPlan", chainPlanId }}
          tasks={data.tasks}
          today={today}
          people={people}
          raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
        />
      ))}

      {creating && (
        <NewPromotionModal
          chainPlanId={chainPlanId}
          chainName={data.chain.name}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function NewPromotionModal({
  chainPlanId,
  chainName,
  onClose,
}: {
  chainPlanId: Id<"chainPlans">;
  chainName: string;
  onClose: () => void;
}) {
  const brands = useQuery(api.brands.list) ?? [];
  const create = useReportedMutation(api.promotions.create);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [storeCount, setStoreCount] = useState("");
  const [brandIds, setBrandIds] = useState<Array<Id<"brands">>>([]);

  const submit = async () => {
    const created = await create({
      chainPlanId,
      name,
      brandIds,
      startDate,
      endDate,
      storeCount: storeCount.trim() === "" ? null : Number(storeCount),
    });
    if (!created.ok) return;
    onClose();
    navigate({ name: "promotion", promotionId: created.value });
  };

  const ready = name.trim() !== "" && startDate !== "" && endDate !== "";

  return (
    <Modal
      title={`New ${chainName} promotion`}
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" variant="primary" disabled={!ready} onClick={submit}>
            Create promotion
          </Button>
        </>
      }
    >
      <Field label="Program name">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Safeway Halloween Demo Program"
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
          />
        </Field>
      </div>
      <Field label="Store count" hint="Optional — how many doors the program covers.">
        <input
          value={storeCount}
          inputMode="numeric"
          onChange={(event) => setStoreCount(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Brands">
        <div className="flex flex-wrap gap-1.5">
          {brands.map((brand) => {
            const selected = brandIds.includes(brand._id);
            return (
              <button
                key={brand._id}
                type="button"
                onClick={() =>
                  setBrandIds((current) =>
                    selected
                      ? current.filter((id) => id !== brand._id)
                      : [...current, brand._id],
                  )
                }
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  selected
                    ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/60"
                    : "bg-slate-800 text-slate-400 ring-1 ring-slate-700 hover:text-slate-200"
                }`}
              >
                {brand.name}
              </button>
            );
          })}
        </div>
      </Field>
    </Modal>
  );
}
