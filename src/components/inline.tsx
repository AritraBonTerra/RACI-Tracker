import { useState, type KeyboardEvent, type ReactNode } from "react";

// Click-to-edit fields. Every value on a checklist row is editable in place:
// during a live review the fix has to be one click away, not behind a form.
//
// Shared behaviour: Enter commits, Escape cancels, blur commits. An unchanged
// value never fires a mutation.

const editorClass =
  "w-full rounded border border-sand-500/70 bg-ink-950 px-1.5 py-0.5 text-sm text-ink-100 focus:outline-none";

const displayClass =
  "-mx-1.5 block w-full cursor-text rounded px-1.5 py-0.5 text-left hover:bg-ink-800/70 focus-visible:bg-ink-800 focus-visible:outline-none";

function focusAndSelect(element: HTMLInputElement | HTMLTextAreaElement | null) {
  if (element === null) return;
  element.focus();
  element.select();
}

export function InlineText({
  value,
  onCommit,
  placeholder = "—",
  multiline = false,
  className = "",
  title,
}: {
  value: string | undefined;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      setDraft(null);
      if (draft.trim() !== (value ?? "").trim()) onCommit(draft);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") setDraft(null);
      if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commit();
      }
    };

    return multiline ? (
      <textarea
        ref={focusAndSelect}
        rows={3}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`${editorClass} resize-y ${className}`}
      />
    ) : (
      <input
        ref={focusAndSelect}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`${editorClass} ${className}`}
      />
    );
  }

  const empty = (value ?? "").trim() === "";
  return (
    <button
      type="button"
      title={title ?? "Click to edit"}
      onClick={() => setDraft(value ?? "")}
      className={`${displayClass} ${empty ? "text-ink-600 italic" : ""} ${className}`}
    >
      {empty ? placeholder : value}
    </button>
  );
}

export function InlineNumber({
  value,
  onCommit,
  placeholder = "—",
  className = "",
  suffix,
}: {
  value: number | undefined;
  onCommit: (next: number | null) => void;
  placeholder?: string;
  className?: string;
  suffix?: ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      setDraft(null);
      const trimmed = draft.trim();
      const next = trimmed === "" ? null : Number(trimmed);
      if (next !== null && !Number.isFinite(next)) return;
      if (next !== (value ?? null)) onCommit(next);
    };

    return (
      <input
        ref={focusAndSelect}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(null);
          if (event.key === "Enter") commit();
        }}
        className={`${editorClass} text-right tabular-nums ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title="Click to edit"
      onClick={() => setDraft(value === undefined ? "" : String(value))}
      className={`${displayClass} text-right tabular-nums ${value === undefined ? "text-ink-600 italic" : ""} ${className}`}
    >
      {value === undefined ? placeholder : value}
      {value !== undefined && suffix}
    </button>
  );
}

/**
 * An ETA. The display is formatted ("Oct 31") but the editor is a native date
 * input, so the value written back is always an ISO calendar day.
 */
export function InlineDate({
  value,
  onCommit,
  render,
  placeholder = "No ETA",
  className = "",
}: {
  value: string | undefined;
  onCommit: (next: string | null) => void;
  render?: (value: string) => ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value ?? ""}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Enter") setEditing(false);
        }}
        onChange={(event) => {
          const next = event.target.value;
          onCommit(next === "" ? null : next);
        }}
        className={`${editorClass} [color-scheme:dark] ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title="Click to set an ETA"
      onClick={() => setEditing(true)}
      className={`${displayClass} ${value === undefined ? "text-ink-600 italic" : ""} ${className}`}
    >
      {value === undefined ? placeholder : (render?.(value) ?? value)}
    </button>
  );
}

/** A compact select that reads as text until you reach for it. */
export function InlineSelect<Value extends string>({
  value,
  options,
  onChange,
  className = "",
  title,
}: {
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string }>;
  onChange: (next: Value) => void;
  className?: string;
  title?: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(event) => {
        const next = options.find((option) => option.value === event.target.value);
        if (next !== undefined) onChange(next.value);
      }}
      className={`cursor-pointer rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-200 hover:border-ink-500 focus:border-sand-500 focus:outline-none ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
