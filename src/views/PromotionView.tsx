import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PhaseChecklist } from "../components/PhaseChecklist";
import { RollupTiles } from "../components/Rollup";
import { Breadcrumb, Loading, MetaItem, NotFound, PageHeader } from "../components/page";
import { InlineDate, InlineNumber, InlineSelect, InlineText } from "../components/inline";
import { Button, ConfirmButton, Modal, Pill } from "../components/ui";
import { formatDay } from "../lib/dates";
import { PHASES, PROMOTION_PHASES, toPhase } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { navigate } from "../lib/router";
import { useReportedMutation } from "../lib/toast";

// Tier three: an approved program. Phases 5-8 are the ones that decide whether
// the promotion actually happened in the store, so this is the page the tool is
// really for.

export function PromotionView({
  promotionId,
  today,
  people,
  focusTaskId,
}: {
  promotionId: Id<"promotions">;
  today: string;
  people: PeopleDirectory;
  focusTaskId?: Id<"tasks">;
}) {
  const data = useQuery(api.promotions.get, { promotionId, today });
  const update = useReportedMutation(api.promotions.update);
  const remove = useReportedMutation(api.promotions.remove);
  const [editingBrands, setEditingBrands] = useState(false);

  if (data === undefined) return <Loading what="the promotion" />;
  if (data === null) return <NotFound what="promotion" />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Breadcrumb
            trail={[
              {
                label: `Season ${data.season.label}`,
                to: { name: "season", seasonId: data.season._id },
              },
              { label: data.chain.name, to: { name: "plan", chainPlanId: data.plan._id } },
              { label: "Promotion" },
            ]}
          />
        }
        title={
          <InlineText
            value={data.promotion.name}
            onCommit={(name) => void update({ promotionId, name })}
            className="text-2xl font-semibold tracking-tight"
          />
        }
        actions={
          <ConfirmButton
            size="md"
            label="Delete promotion"
            confirmLabel="Delete and lose its checklist?"
            onConfirm={async () => {
              const removed = await remove({ promotionId });
              if (removed.ok) navigate({ name: "plan", chainPlanId: data.plan._id });
            }}
          />
        }
        meta={
          <>
            <MetaItem label="Window">
              <span className="flex items-center gap-1">
                <InlineDate
                  value={data.promotion.startDate}
                  onCommit={(startDate) => {
                    // A promotion always has a window; clearing a date is a no-op.
                    if (startDate !== null) void update({ promotionId, startDate });
                  }}
                  render={(value) => formatDay(value, today)}
                />
                <span className="text-slate-600">–</span>
                <InlineDate
                  value={data.promotion.endDate}
                  onCommit={(endDate) => {
                    if (endDate !== null) void update({ promotionId, endDate });
                  }}
                  render={(value) => formatDay(value, today)}
                />
              </span>
            </MetaItem>
            <MetaItem label="Stores">
              <InlineNumber
                value={data.promotion.storeCount}
                onCommit={(storeCount) => void update({ promotionId, storeCount })}
                className="w-16"
              />
            </MetaItem>
            <MetaItem label="Current phase">
              <InlineSelect
                value={String(data.promotion.currentPhase)}
                options={PROMOTION_PHASES.map((phase) => ({
                  value: String(phase),
                  label: `${phase} · ${PHASES[phase].title}`,
                }))}
                onChange={(value) => {
                  const phase = toPhase(Number(value));
                  if (phase !== null) void update({ promotionId, currentPhase: phase });
                }}
              />
            </MetaItem>
            <MetaItem label="Brands">
              <span className="flex flex-wrap items-center gap-1">
                {data.brands.length === 0 ? (
                  <span className="text-slate-600 italic">None</span>
                ) : (
                  data.brands.map((brand) => (
                    <Pill
                      key={brand._id}
                      className="bg-slate-800 text-slate-300 ring-1 ring-slate-700 ring-inset"
                    >
                      {brand.name}
                    </Pill>
                  ))
                )}
                <Button variant="ghost" size="xs" onClick={() => setEditingBrands(true)}>
                  Edit
                </Button>
              </span>
            </MetaItem>
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-slate-400">
          <InlineText
            value={data.promotion.notes}
            multiline
            placeholder="Add a note about this promotion…"
            onCommit={(notes) => void update({ promotionId, notes })}
          />
        </div>
      </PageHeader>

      <RollupTiles rollup={data.rollup} />

      {PROMOTION_PHASES.map((phase) => (
        <PhaseChecklist
          key={phase}
          phase={phase}
          owner={{ tier: "promotion", promotionId }}
          tasks={data.tasks}
          today={today}
          people={people}
          raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
          focusTaskId={focusTaskId}
        />
      ))}

      {editingBrands && (
        <BrandPickerModal
          promotionId={promotionId}
          selected={data.promotion.brandIds}
          onClose={() => setEditingBrands(false)}
        />
      )}
    </div>
  );
}

function BrandPickerModal({
  promotionId,
  selected,
  onClose,
}: {
  promotionId: Id<"promotions">;
  selected: ReadonlyArray<Id<"brands">>;
  onClose: () => void;
}) {
  const brands = useQuery(api.brands.list);
  const update = useReportedMutation(api.promotions.update);
  const [draft, setDraft] = useState<Array<Id<"brands">>>([...selected]);

  return (
    <Modal
      title="Brands on this promotion"
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            variant="primary"
            onClick={async () => {
              const saved = await update({ promotionId, brandIds: draft });
              if (saved.ok) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {(brands ?? []).map((brand) => {
          const on = draft.includes(brand._id);
          return (
            <button
              key={brand._id}
              type="button"
              onClick={() =>
                setDraft((current) =>
                  on ? current.filter((id) => id !== brand._id) : [...current, brand._id],
                )
              }
              className={`rounded-full px-2.5 py-1 text-xs transition ${
                on
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/60"
                  : "bg-slate-800 text-slate-400 ring-1 ring-slate-700 hover:text-slate-200"
              }`}
            >
              {brand.name}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">
        Brands are maintained in Manage. Placeholder entries stand in until the real
        portfolio is loaded.
      </p>
    </Modal>
  );
}
