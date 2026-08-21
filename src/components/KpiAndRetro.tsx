import { useQuery } from "convex/react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { InlineText } from "./inline";
import { Panel, Skeleton } from "./ui";
import { useReportedMutation } from "../lib/toast";

// Phase 7 (tracking & measurement) and phase 8 (review) for one promotion: the
// slide-14 KPI grid and the retro underneath it.
//
// Detachable by design (#14). This file is the whole client half of the
// feature; it is rendered from exactly two lines in `PromotionView`, and both
// components subscribe to the same query, so the pair costs one subscription.

type Board = NonNullable<FunctionReturnType<typeof api.kpi.board>>;
type MetricRow = Board["metrics"][number];
type KpiMetric = Doc<"kpiEntries">["metric"];
type RepeatVerdict = NonNullable<Doc<"retros">["repeatNextYear"]>;

// How a figure reads once it is on screen. The stored value is always a plain
// number — the unit decides the dressing, so nobody has to type a dollar sign.
type Unit = "count" | "currency" | "percent";

type MetricMeta = { label: string; unit: Unit; hint: string };

// Slide 14's rows. A `Record` rather than a list so adding a metric to the
// schema fails to compile until it has a label here.
const METRICS: Record<KpiMetric, MetricMeta> = {
  depletions: {
    label: "Depletions",
    unit: "count",
    hint: "9L cases out of the distributor",
  },
  pos: { label: "POS data", unit: "currency", hint: "Scanned retail sales" },
  cwd: { label: "CWD", unit: "percent", hint: "Chain-wide distribution" },
  dollars_per_store_week: {
    label: "$/Store/Wk",
    unit: "currency",
    hint: "Rate of sale per door",
  },
  investment: {
    label: "$ investment",
    unit: "currency",
    hint: "Trade spend behind the program",
  },
};

const METRIC_ORDER = [
  "depletions",
  "pos",
  "cwd",
  "dollars_per_store_week",
  "investment",
] as const satisfies readonly KpiMetric[];

const decimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case "currency": {
      // Cents only where there are cents: "$168,400" and "$623.70" both read as
      // money, "$168,400.00" reads as a spreadsheet.
      const places = Number.isInteger(value) ? 0 : 2;
      return value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: places,
        maximumFractionDigits: places,
      });
    }
    case "percent":
      return `${decimals.format(value)}%`;
    case "count":
      return decimals.format(value);
  }
}

/** Minus renders as a proper sign, not a hyphen, and never inside "$-740". */
function signed(value: number, body: string): string {
  if (value > 0) return `+${body}`;
  if (value < 0) return `−${body}`;
  return body;
}

/**
 * "+740 (+59.7%)". A percentage-point metric like CWD says "pts", because
 * "+26%" against a 62% baseline is a different and wrong number.
 */
function formatUplift(uplift: NonNullable<MetricRow["uplift"]>, unit: Unit): string {
  const magnitude = Math.abs(uplift.absolute);
  const body =
    unit === "percent"
      ? `${decimals.format(magnitude)} pts`
      : formatValue(magnitude, unit);
  const absolute = signed(uplift.absolute, body);
  if (uplift.percent === null) return absolute;
  return `${absolute} (${signed(uplift.percent, `${oneDecimal.format(Math.abs(uplift.percent))}%`)})`;
}

function upliftTone(absolute: number): string {
  if (absolute > 0) return "text-emerald-300";
  if (absolute < 0) return "text-rose-300";
  return "text-ink-300";
}

// --- Phase 7 --------------------------------------------------------------

export function KpiTable({ promotionId }: { promotionId: Id<"promotions"> }) {
  const board = useQuery(api.kpi.board, { promotionId });
  const setMetric = useReportedMutation(api.kpi.setMetric);

  if (board === undefined) return <BoardSkeleton title="Phase 7 · KPI table" rows={5} />;
  // The promotion was deleted underneath us; the page's own NotFound takes over.
  if (board === null) return null;

  const rows = new Map(board.metrics.map((row) => [row.metric, row]));
  const filled = board.metrics.length;

  return (
    <Panel
      title="Phase 7 · KPI table"
      subtitle="Typed by hand — there is no data feed. Uplift is computed wherever both columns hold a number."
      actions={
        <span className="text-2xs text-ink-500 tabular-nums">
          {filled}/{METRIC_ORDER.length} metrics entered
        </span>
      }
    >
      {filled === 0 && (
        <p className="border-b border-ink-800/70 bg-ink-950/40 px-4 py-2.5 text-xs text-ink-400">
          <span className="font-medium text-ink-200">No numbers yet.</span> These five
          rows are the deck's slide-14 grid — click any figure below and type what the
          report says. Uplift works itself out.
        </p>
      )}
      {/* Five rows against three number columns: on a phone the table keeps its
          shape and scrolls sideways rather than folding into nonsense. */}
      <p className="border-b border-ink-800/70 px-4 py-1.5 text-3xs text-ink-600 lg:hidden">
        Scroll the table sideways for the promotional period and uplift.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-3xs font-semibold tracking-wider text-ink-500 uppercase">
              <th className="px-4 py-2 text-left">Metric</th>
              <th className="px-3 py-2 text-right">Baseline</th>
              <th className="px-3 py-2 text-right">Promotional period</th>
              <th className="px-4 py-2 text-right">Uplift</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ORDER.map((metric) => {
              const meta = METRICS[metric];
              const row = rows.get(metric);
              const format = (value: number) => formatValue(value, meta.unit);

              return (
                <tr
                  key={metric}
                  className="border-b border-ink-800/60 last:border-b-0 hover:bg-ink-900/60"
                >
                  <td className="px-4 py-2 align-top">
                    <p className="font-medium text-ink-200">{meta.label}</p>
                    <p className="text-2xs text-ink-500">{meta.hint}</p>
                    <div className="mt-0.5 max-w-md text-2xs text-ink-500">
                      <InlineText
                        value={row?.note}
                        placeholder="Add a note…"
                        onCommit={(note) => void setMetric({ promotionId, metric, note })}
                      />
                    </div>
                  </td>
                  <td className="w-36 px-3 py-2 align-top">
                    <NumberCell
                      value={row?.baseline}
                      format={format}
                      onCommit={(baseline) =>
                        void setMetric({ promotionId, metric, baseline })
                      }
                    />
                  </td>
                  <td className="w-36 px-3 py-2 align-top">
                    <NumberCell
                      value={row?.promotional}
                      format={format}
                      onCommit={(promotional) =>
                        void setMetric({ promotionId, metric, promotional })
                      }
                    />
                  </td>
                  <td className="w-52 px-4 py-2 align-top">
                    <UpliftCell
                      row={row}
                      unit={meta.unit}
                      onCommit={(upliftOverride) =>
                        void setMetric({ promotionId, metric, upliftOverride })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-800/70 px-4 py-2 text-2xs text-ink-600">
        Click a figure to type it. Click the uplift column to override the calculation
        with a sentence — useful on the investment row, where the answer is a return, not
        a difference.
      </p>
    </Panel>
  );
}

/**
 * The uplift column. Computed by default, and clickable to replace with free
 * text: on a spend line "−$18,400" is arithmetic that means nothing, while
 * "$1.62 margin per $1 spent" is the number the room argues about.
 */
function UpliftCell({
  row,
  unit,
  onCommit,
}: {
  row: MetricRow | undefined;
  unit: Unit;
  onCommit: (next: string | null) => void;
}) {
  const override = row?.upliftOverride;
  const uplift = row?.uplift ?? null;

  const display =
    override !== undefined ? (
      <span className="text-amber-200">{override}</span>
    ) : uplift !== null ? (
      <span className={`font-medium tabular-nums ${upliftTone(uplift.absolute)}`}>
        {formatUplift(uplift, unit)}
      </span>
    ) : (
      <span className="text-ink-600 italic">
        {row?.baseline !== undefined || row?.promotional !== undefined
          ? "Needs both columns"
          : "—"}
      </span>
    );

  return (
    <TextCell
      value={override}
      display={display}
      title={
        override === undefined
          ? "Click to override the computed uplift"
          : "Manual override — clear it to go back to the calculation"
      }
      onCommit={onCommit}
    />
  );
}

// --- Phase 8 --------------------------------------------------------------

const VERDICTS: Record<RepeatVerdict, { label: string; className: string }> = {
  yes: {
    label: "Repeat next year",
    className: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  },
  maybe: {
    label: "Maybe next year",
    className: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  },
  no: {
    label: "Do not repeat",
    className: "border-rose-500/60 bg-rose-500/10 text-rose-200",
  },
};

const VERDICT_OPTIONS = [
  { value: "", label: "Repeat next year? Not decided" },
  { value: "yes", label: "Repeat next year: yes" },
  { value: "maybe", label: "Repeat next year: maybe" },
  { value: "no", label: "Repeat next year: no" },
] as const satisfies ReadonlyArray<{ value: RepeatVerdict | ""; label: string }>;

export function RetroPanel({ promotionId }: { promotionId: Id<"promotions"> }) {
  const board = useQuery(api.kpi.board, { promotionId });
  const save = useReportedMutation(api.kpi.saveRetro);

  if (board === undefined) return <BoardSkeleton title="Phase 8 · Retro" rows={2} />;
  if (board === null) return null;

  const retro = board.retro;
  const verdict = retro?.repeatNextYear;
  const written =
    retro !== null &&
    [retro?.worked, retro?.didntWork, retro?.notes].some(
      (field) => field !== undefined && field.trim() !== "",
    );

  return (
    <Panel
      title="Phase 8 · Retro"
      subtitle="What worked, what didn't, and whether it earns a slot next season."
      actions={
        <select
          value={verdict ?? ""}
          onChange={(event) => {
            const chosen = VERDICT_OPTIONS.find(
              (option) => option.value === event.target.value,
            );
            if (chosen === undefined) return;
            void save({
              promotionId,
              repeatNextYear: chosen.value === "" ? null : chosen.value,
            });
          }}
          aria-label="Repeat next year?"
          className={`h-8 cursor-pointer rounded-md border px-2 text-xs transition focus:outline-none ${
            verdict === undefined
              ? "border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-500"
              : VERDICTS[verdict].className
          }`}
        >
          {VERDICT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      }
    >
      {!written && (
        <p className="border-b border-ink-800/70 bg-ink-950/40 px-4 py-2.5 text-xs text-ink-400">
          <span className="font-medium text-ink-200">No retro written yet.</span> Three
          boxes, written once the window closes — they are what next season's phase 0 gets
          to start from. Click a box to type into it.
        </p>
      )}
      <div className="grid gap-px bg-ink-800 sm:grid-cols-2">
        <RetroField
          label="What worked"
          accent="text-emerald-300"
          value={retro?.worked}
          placeholder="The quarter-pallet went up in week one…"
          onCommit={(worked) => void save({ promotionId, worked })}
        />
        <RetroField
          label="What didn't"
          accent="text-rose-300"
          value={retro?.didntWork}
          placeholder="Four stores never built the display…"
          onCommit={(didntWork) => void save({ promotionId, didntWork })}
        />
      </div>
      <div className="border-t border-ink-800">
        <RetroField
          label="Notes for next year"
          accent="text-ink-400"
          value={retro?.notes}
          placeholder="What phase 0 should carry into the next season…"
          onCommit={(notes) => void save({ promotionId, notes })}
        />
      </div>
    </Panel>
  );
}

function RetroField({
  label,
  accent,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  accent: string;
  value: string | undefined;
  placeholder: string;
  onCommit: (next: string) => void;
}) {
  return (
    <div className="bg-ink-900/60 px-4 py-3">
      <p className={`text-3xs font-semibold tracking-wider uppercase ${accent}`}>
        {label}
      </p>
      <div className="mt-1 text-sm whitespace-pre-wrap text-ink-300">
        <InlineText
          value={value}
          multiline
          placeholder={placeholder}
          onCommit={onCommit}
        />
      </div>
    </div>
  );
}

// --- Cells ----------------------------------------------------------------
//
// Both cells edit raw text but read as formatted values, which the shared
// inline editors deliberately do not do (a task quantity is just a number).
// Keeping them here is what makes the feature deletable in one file.

const editorClass =
  "w-full rounded border border-sand-500/70 bg-ink-950 px-1.5 py-0.5 text-sm text-ink-100 focus:outline-none";

const displayClass =
  "-mx-1.5 block w-full cursor-text rounded px-1.5 py-0.5 hover:bg-ink-800/70 focus-visible:bg-ink-800 focus-visible:outline-none";

function focusAndSelect(element: HTMLInputElement | null) {
  element?.focus();
  element?.select();
}

function onEditorKey(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
  cancel: () => void,
) {
  if (event.key === "Escape") cancel();
  if (event.key === "Enter") {
    event.preventDefault();
    commit();
  }
}

/** A figure: formatted when read, plain when edited. */
function NumberCell({
  value,
  format,
  onCommit,
}: {
  value: number | undefined;
  format: (value: number) => string;
  onCommit: (next: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      setDraft(null);
      // These figures get read off a spreadsheet, so "$168,400" is a number.
      const cleaned = draft.replace(/[$,\s]/g, "");
      const next = cleaned === "" ? null : Number(cleaned);
      if (next !== null && !Number.isFinite(next)) return;
      if (next !== (value ?? null)) onCommit(next);
    };

    return (
      <input
        ref={focusAndSelect}
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => onEditorKey(event, commit, () => setDraft(null))}
        className={`${editorClass} text-right tabular-nums`}
      />
    );
  }

  return (
    <button
      type="button"
      title="Click to edit"
      onClick={() => setDraft(value === undefined ? "" : String(value))}
      className={`${displayClass} text-right tabular-nums ${
        value === undefined ? "text-ink-600 italic" : "text-ink-100"
      }`}
    >
      {value === undefined ? "—" : format(value)}
    </button>
  );
}

/** Free text whose read state is something other than the text itself. */
function TextCell({
  value,
  display,
  title,
  onCommit,
}: {
  value: string | undefined;
  display: ReactNode;
  title: string;
  onCommit: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      setDraft(null);
      const trimmed = draft.trim();
      if (trimmed === (value ?? "")) return;
      onCommit(trimmed === "" ? null : trimmed);
    };

    return (
      <input
        ref={focusAndSelect}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => onEditorKey(event, commit, () => setDraft(null))}
        className={`${editorClass} text-right`}
      />
    );
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => setDraft(value ?? "")}
      className={`${displayClass} text-right`}
    >
      {display}
    </button>
  );
}

/** The panel chrome with rows the size of the real ones, before they land. */
function BoardSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <Panel title={title}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-ink-800/60 px-4 py-3 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-1.5 h-2.5 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="hidden h-3.5 w-20 sm:block" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      ))}
    </Panel>
  );
}
