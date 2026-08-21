import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { dueLabel, formatDay, isOverdue } from "../lib/dates";
import { STATUSES, STATUS_ORDER, type TaskStatus } from "../lib/domain";
import type { PeopleDirectory } from "../lib/people";
import { useReportedMutation } from "../lib/toast";
import { InlineDate, InlineNumber, InlineText } from "./inline";
import { AssignButton, RaciEditor } from "./RaciEditor";
import { Button, ConfirmButton } from "./ui";

// One checklist row. Everything visible on it is editable where it sits: status,
// ETA, spec, quantity, who is Responsible, and — behind the caret — the full
// RACI block and the delivery evidence. Overdue and Blocked are the two states
// that get to shout; Unassigned shouts loudest, from the assign button itself.

export function TaskRow({
  task,
  today,
  people,
  isFirst,
  isLast,
  focused = false,
}: {
  task: Doc<"tasks">;
  today: string;
  people: PeopleDirectory;
  isFirst: boolean;
  isLast: boolean;
  /** Arrived here from a needs-attention link: open the row and scroll to it. */
  focused?: boolean;
}) {
  const update = useReportedMutation(api.tasks.update);
  const setStatus = useReportedMutation(api.tasks.setStatus);
  const remove = useReportedMutation(api.tasks.remove);
  const move = useReportedMutation(api.tasks.move);

  const [expanded, setExpanded] = useState(focused);
  // Non-null while the row is asking for the reason a task is being blocked.
  const [blockDraft, setBlockDraft] = useState<string | null>(null);
  const row = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    row.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const status = STATUSES[task.status];
  const overdue = isOverdue(task.eta, task.status, today);

  const changeStatus = (next: TaskStatus) => {
    if (next === "blocked") {
      // The reason is mandatory server-side; ask for it rather than bounce the write.
      setBlockDraft(task.blockedReason ?? "");
      setExpanded(true);
      return;
    }
    void setStatus({ taskId: task._id, status: next });
  };

  return (
    <li
      ref={row}
      className={`group relative border-b border-slate-800/70 last:border-b-0 ${
        focused ? "bg-sky-500/5 ring-1 ring-sky-400/50 ring-inset" : ""
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${overdue ? "bg-amber-400" : status.edge}`}
      />

      <div className="flex items-start gap-3 py-2 pr-3 pl-4 transition hover:bg-slate-800/40">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-1 text-[10px] text-slate-600 transition hover:text-slate-200"
          title="Details"
        >
          {expanded ? "▼" : "▶"}
        </button>

        <div className="min-w-0 flex-1">
          {/* The category is the section heading above this row, so it is not
              repeated here; it stays editable in the detail panel. */}
          <InlineText
            value={task.name}
            onCommit={(name) => void update({ taskId: task._id, name })}
            className="max-w-full text-sm font-medium text-slate-100"
          />

          <div className="mt-0.5 text-xs text-slate-400">
            <InlineText
              value={task.spec}
              onCommit={(spec) => void update({ taskId: task._id, spec })}
              placeholder="Add spec…"
            />
          </div>

          {task.status === "blocked" && blockDraft === null && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-200 ring-1 ring-rose-500/40 ring-inset">
              <span className="font-semibold tracking-wide uppercase">Blocked</span>
              <InlineText
                value={task.blockedReason}
                placeholder="Say what is blocking it…"
                onCommit={(blockedReason) =>
                  void setStatus({ taskId: task._id, status: "blocked", blockedReason })
                }
                className="flex-1 text-rose-100"
              />
            </p>
          )}

          {blockDraft !== null && (
            <BlockReasonPrompt
              draft={blockDraft}
              onDraft={setBlockDraft}
              onCancel={() => setBlockDraft(null)}
              onSave={async () => {
                const saved = await setStatus({
                  taskId: task._id,
                  status: "blocked",
                  blockedReason: blockDraft,
                });
                if (saved.ok) setBlockDraft(null);
              }}
            />
          )}
        </div>

        <div className="w-14 shrink-0 pt-0.5 text-sm text-slate-300">
          <InlineNumber
            value={task.quantity}
            onCommit={(quantity) => void update({ taskId: task._id, quantity })}
          />
        </div>

        <div className="w-36 shrink-0 pt-0.5 text-sm">
          <InlineDate
            value={task.eta}
            onCommit={(eta) => void update({ taskId: task._id, eta })}
            render={(eta) => (
              <span className={overdue ? "font-semibold text-amber-300" : "text-slate-300"}>
                {formatDay(eta, today)}
                {/* Once delivered the countdown is noise — the date is the record. */}
                {task.status !== "delivered" && (
                  <span
                    className={`ml-1.5 text-[11px] ${overdue ? "text-amber-400/90" : "text-slate-500"}`}
                  >
                    {dueLabel(eta, today)}
                  </span>
                )}
              </span>
            )}
          />
        </div>

        {/* The fast path: assigning a Responsible without opening the row. */}
        <div className="hidden w-40 shrink-0 pt-0.5 xl:block">
          <AssignButton task={task} people={people} />
        </div>

        <div className="shrink-0 pt-0.5">
          <select
            value={task.status}
            onChange={(event) => {
              const next = STATUS_ORDER.find((option) => option === event.target.value);
              if (next !== undefined) changeStatus(next);
            }}
            title="Status"
            className={`cursor-pointer appearance-none rounded-full py-1 pr-2 pl-2.5 text-[11px] font-medium focus:outline-none ${status.pill}`}
          >
            {STATUS_ORDER.map((option) => (
              <option key={option} value={option} className="bg-slate-900 text-slate-100">
                {STATUSES[option].label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-16 shrink-0 justify-end gap-0.5 pt-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="xs"
            className="px-1"
            disabled={isFirst}
            title="Move up"
            onClick={() => void move({ taskId: task._id, direction: "up" })}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="xs"
            className="px-1"
            disabled={isLast}
            title="Move down"
            onClick={() => void move({ taskId: task._id, direction: "down" })}
          >
            ↓
          </Button>
          <ConfirmButton
            label="✕"
            confirmLabel="Delete?"
            onConfirm={() => void remove({ taskId: task._id })}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800/70 bg-slate-950/40 px-4 py-3 pl-8">
          <RaciEditor task={task} people={people} />

          <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Category">
              <InlineText
                value={task.category}
                placeholder="Ungrouped"
                onCommit={(category) => void update({ taskId: task._id, category })}
                className="text-xs text-slate-300"
              />
            </Detail>
            <Detail label="Delivered to">
              <InlineText
                value={task.deliveredTo}
                placeholder="Who received it?"
                onCommit={(deliveredTo) => void update({ taskId: task._id, deliveredTo })}
                className="text-xs text-slate-300"
              />
            </Detail>
            <Detail label="Proof of execution" className="md:col-span-2">
              <InlineText
                value={task.proofOfExecution}
                placeholder="Photo audit, receipt, deck…"
                onCommit={(proofOfExecution) =>
                  void update({ taskId: task._id, proofOfExecution })
                }
                className="text-xs text-slate-300"
              />
            </Detail>
            <Detail label="Notes" className="md:col-span-4">
              <InlineText
                value={task.notes}
                multiline
                placeholder="Add a note…"
                onCommit={(notes) => void update({ taskId: task._id, notes })}
                className="text-xs text-slate-300"
              />
            </Detail>
          </div>
        </div>
      )}
    </li>
  );
}

function Detail({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="mb-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Blocking a task is the one status change that cannot be a single click. */
function BlockReasonPrompt({
  draft,
  onDraft,
  onCancel,
  onSave,
}: {
  draft: string;
  onDraft: (next: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-1.5 rounded-md bg-rose-500/10 p-2 ring-1 ring-rose-500/50 ring-inset">
      <p className="mb-1 text-[10px] font-semibold tracking-wider text-rose-300 uppercase">
        Why is this blocked?
      </p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={draft}
          placeholder="e.g. no inventory at distributor"
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
            if (event.key === "Escape") onCancel();
          }}
          className="flex-1 rounded border border-rose-500/50 bg-slate-950 px-2 py-1 text-xs text-rose-50 placeholder:text-rose-300/40 focus:border-rose-400 focus:outline-none"
        />
        <Button variant="danger" size="xs" onClick={onSave} disabled={draft.trim() === ""}>
          Block
        </Button>
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
