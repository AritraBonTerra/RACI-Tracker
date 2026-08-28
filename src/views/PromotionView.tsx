import { useQuery } from "convex/react";
import { Fragment, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { KpiTable, RetroPanel } from "../components/KpiAndRetro";
import { PhaseChecklist } from "../components/PhaseChecklist";
import { RollupTiles } from "../components/Rollup";
import {
  Breadcrumb,
  LastEdited,
  MetaItem,
  NotFound,
  PageHeader,
  TierSkeleton,
} from "../components/page";
import { InlineDate, InlineNumber, InlineSelect, InlineText } from "../components/inline";
import { Button, ConfirmButton, Modal, Pill } from "../components/ui";
import { Pathway } from "../components/Pathway";
import { useIsAdministrator } from "../components/AuthGate";
import { formatDay } from "../lib/dates";
import { PHASES, PROMOTION_PHASES, toPhase } from "../lib/domain";
import { buildPathway, promotionAnchors } from "../lib/pathway";
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
  // Deleting a Promotion is an Administrator's alone (#22). For a
  // promotion-only Member it would also delete their own way back in.
  const isAdministrator = useIsAdministrator();

  if (data === undefined) return <TierSkeleton />;
  if (data === null) return <NotFound />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Breadcrumb
            trail={[
              // Both parents are orientation for a promotion-only Member —
              // a name each, and no way through either (#22).
              {
                label: `Year ${data.season.label}`,
                to:
                  data.season.reach === "full"
                    ? { name: "season", seasonId: data.season._id }
                    : undefined,
                context: data.season.reach !== "full",
              },
              {
                label: data.chain.name,
                to:
                  data.plan.reach === "full"
                    ? { name: "plan", chainPlanId: data.plan._id }
                    : undefined,
                context: data.plan.reach !== "full",
              },
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
          isAdministrator ? (
            <ConfirmButton
              size="md"
              label="Delete promotion"
              confirmLabel="Delete and lose its checklist?"
              onConfirm={async () => {
                const removed = await remove({ promotionId });
                if (!removed.ok) return;
                // Only an Administrator gets here, and their reach on the plan
                // above is always full, so the plan is where to land.
                navigate({ name: "plan", chainPlanId: data.plan._id });
              }}
            />
          ) : undefined
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
                  className="whitespace-nowrap"
                />
                <span className="text-ink-600">–</span>
                <InlineDate
                  value={data.promotion.endDate}
                  onCommit={(endDate) => {
                    if (endDate !== null) void update({ promotionId, endDate });
                  }}
                  render={(value) => formatDay(value, today)}
                  className="whitespace-nowrap"
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
                  <span className="text-ink-600 italic">None</span>
                ) : (
                  data.brands.map((brand) => (
                    <Pill
                      key={brand._id}
                      className="bg-ink-800 text-ink-300 ring-1 ring-ink-700 ring-inset"
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
            <LastEdited record={data.promotion} editors={data.editors} />
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-ink-400">
          <InlineText
            value={data.promotion.notes}
            multiline
            placeholder="Add a note about this promotion…"
            onCommit={(notes) => void update({ promotionId, notes })}
          />
        </div>
      </PageHeader>

      <Pathway
        phases={buildPathway(
          PROMOTION_PHASES,
          data.tasks,
          promotionAnchors(data.promotion),
          data.promotion.currentPhase,
          today,
        )}
        today={today}
      />

      <RollupTiles rollup={data.rollup} />

      {PROMOTION_PHASES.map((phase) => (
        <Fragment key={phase}>
          <PhaseChecklist
            phase={phase}
            owner={{ tier: "promotion", promotionId }}
            tasks={data.tasks}
            today={today}
            people={people}
            editors={data.editors}
            raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
            focusTaskId={focusTaskId}
          />
          {/* Detachable phase-7/8 feature (#14): the KPI grid and the retro sit
              under the checklist of the phase they belong to. */}
          {phase === 7 && <KpiTable promotionId={promotionId} />}
          {phase === 8 && <RetroPanel promotionId={promotionId} />}
        </Fragment>
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
                  ? "bg-sand-400/20 text-sand-100 ring-1 ring-sand-400/60"
                  : "bg-ink-800 text-ink-400 ring-1 ring-ink-700 hover:text-ink-200"
              }`}
            >
              {brand.name}
            </button>
          );
        })}
      </div>
      <p className="text-2xs text-ink-500">
        Brands are maintained in Manage. Placeholder entries stand in until the real
        portfolio is loaded.
      </p>
    </Modal>
  );
}
