import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useIsAdministrator } from "../components/AuthGate";
import { BrandToggles } from "../components/BrandToggles";
import { InlineDate, InlineSelect, InlineText } from "../components/inline";
import { Pathway } from "../components/Pathway";
import { PhaseChecklist } from "../components/PhaseChecklist";
import {
  Breadcrumb,
  cardClass,
  cardGrid,
  LastEdited,
  MetaItem,
  NotFound,
  PageHeader,
  TierSkeleton,
} from "../components/page";
import { RollupChips, RollupTiles } from "../components/Rollup";
import {
  Button,
  ConfirmButton,
  EmptyState,
  Field,
  inputClass,
  Modal,
  Panel,
} from "../components/ui";
import { formatDay, formatRange } from "../lib/dates";
import { CHAIN_PLAN_PHASES, PHASES, toPhaseIn } from "../lib/domain";
import { buildPathway, chainPlanAnchors } from "../lib/pathway";
import type { PeopleDirectory } from "../lib/people";
import { href, navigate } from "../lib/router";
import { useReportedMutation } from "../lib/toast";

// Tier two: one chain x one season. Phases 1-4 are the road to an agreement;
// once there is one, the promotions underneath carry phases 5-8.

export function ChainPlanView({
  chainPlanId,
  today,
  people,
  focusTaskId,
}: {
  chainPlanId: Id<"chainPlans">;
  today: string;
  people: PeopleDirectory;
  focusTaskId?: Id<"tasks">;
}) {
  const data = useQuery(api.chainPlans.get, { chainPlanId, today });
  const update = useReportedMutation(api.chainPlans.update);
  const remove = useReportedMutation(api.chainPlans.remove);
  const [creating, setCreating] = useState(false);
  // Creating and deleting under a plan is an Administrator's alone (#22); a
  // Member granted this plan reads and works it, but does not reshape it.
  const isAdministrator = useIsAdministrator();

  if (data === undefined) return <TierSkeleton />;
  if (data === null) return <NotFound />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Breadcrumb
            trail={[
              {
                label: `Year ${data.season.label}`,
                // A Member granted this plan sees the year as a name only.
                to:
                  data.season.reach === "full"
                    ? { name: "season", seasonId: data.season._id }
                    : undefined,
                context: data.season.reach !== "full",
              },
              { label: "Chain plan" },
            ]}
          />
        }
        title={data.chain.name}
        actions={
          isAdministrator ? (
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
                  if (!removed.ok) return;
                  // Only an Administrator gets here, and their reach on the
                  // year above is always full, so the year is where to land.
                  navigate({ name: "season", seasonId: data.season._id });
                }}
              />
            </>
          ) : undefined
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
                  const phase = toPhaseIn(CHAIN_PLAN_PHASES, Number(value));
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
            <LastEdited record={data.plan} editors={data.editors} />
          </>
        }
      >
        <div className="mt-2 max-w-3xl text-sm text-ink-400">
          <InlineText
            value={data.plan.notes}
            multiline
            placeholder="Add a note about this plan…"
            onCommit={(notes) => void update({ chainPlanId, notes })}
          />
        </div>
      </PageHeader>

      <Pathway
        phases={buildPathway(
          CHAIN_PLAN_PHASES,
          data.tasks,
          chainPlanAnchors(data.plan),
          data.plan.currentPhase,
          today,
        )}
        today={today}
      />

      <RollupTiles rollup={data.rollup} />

      <Panel
        title="Promotions"
        subtitle="Approved programs under this plan. Each carries its own phases 5–8."
        actions={
          isAdministrator ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              + Promotion
            </Button>
          ) : undefined
        }
      >
        {data.promotions.length === 0 ? (
          <EmptyState
            title="No promotions under this plan yet"
            action={
              isAdministrator ? (
                <Button variant="primary" size="md" onClick={() => setCreating(true)}>
                  + Promotion
                </Button>
              ) : undefined
            }
          >
            A promotion is one approved program: this chain, a date window, a set of stores. Phases
            5–8 — activation, execution, measurement, review — hang off it.
          </EmptyState>
        ) : (
          <div className={cardGrid(data.promotions.length)}>
            {data.promotions.map((node) => (
              <a
                key={node.promotion._id}
                href={href({ name: "promotion", promotionId: node.promotion._id })}
                className={cardClass}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink-100">{node.promotion.name}</h3>
                  <RollupChips rollup={node.rollup} />
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  {formatRange(node.promotion.startDate, node.promotion.endDate, today)}
                  {node.promotion.storeCount !== undefined &&
                    ` · ${node.promotion.storeCount} stores`}
                </p>
                <p className="mt-3 text-2xs text-ink-500">
                  Phase {node.promotion.currentPhase} · {PHASES[node.promotion.currentPhase].title}
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
          editors={data.editors}
          raciDefault={data.raciDefaults.find((row) => row.phase === phase)}
          focusTaskId={focusTaskId}
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
  const brands = useQuery(api.brands.list);
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
          placeholder={`${chainName} Halloween Demo Program`}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={inputClass}
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
        <BrandToggles
          brands={brands}
          selected={brandIds}
          onToggle={(brandId) =>
            setBrandIds((current) =>
              current.includes(brandId)
                ? current.filter((id) => id !== brandId)
                : [...current, brandId],
            )
          }
        />
      </Field>
      {!ready && (
        <p className="text-2xs text-ink-500">
          A program name and both dates are needed before this can be created.
        </p>
      )}
    </Modal>
  );
}
