import { type KeyboardEvent, type ReactNode, useState } from "react";

// Click-to-edit fields. Every value on a checklist row is editable in place:
// during a live review the fix has to be one click away, not behind a form.
//
// Shared behaviour: Enter commits, Escape cancels, blur commits. An unchanged
// value never fires a mutation.

// Exported so a detachable editor elsewhere (the KPI grid) looks like these
// without copying the strings.
export const editorClass =
  "w-full rounded border border-sand-500/70 bg-ink-950 px-1.5 py-0.5 text-sm text-ink-100 focus:outline-none";

export const displayClass =
  "-mx-1.5 block w-full cursor-text rounded px-1.5 py-0.5 hover:bg-ink-800/70 focus-visible:bg-ink-800 focus-visible:outline-none";

export function focusAndSelect(element: HTMLInputElement | HTMLTextAreaElement | null) {
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
      className={`${displayClass} text-left ${empty ? "text-ink-600 italic" : ""} ${className}`}
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
  label,
}: {
  value: number | undefined;
  onCommit: (next: number | null) => void;
  placeholder?: string;
  className?: string;
  suffix?: ReactNode;
  /** What the number is ("Quantity"), so an empty cell has a name and not just a dash. */
  label?: string;
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
        aria-label={label}
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
      aria-label={label === undefined ? undefined : `${label}: ${value ?? "not set"}`}
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
 * input, so the value written back is always an ISO calendar day. The draft is
 * buffered like the text editors: typing a day segment by segment fires one
 * write on blur/Enter, not one per keystroke, and Escape really cancels.
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
  const [draft, setDraft] = useState<string | null>(null);

  if (draft !== null) {
    const commit = () => {
      setDraft(null);
      const next = draft === "" ? null : draft;
      if (next !== (value ?? null)) onCommit(next);
    };

    return (
      <input
        type="date"
        ref={(element) => element?.focus()}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") setDraft(null);
          if (event.key === "Enter") commit();
        }}
        className={`${editorClass} ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      title="Click to set an ETA"
      onClick={() => setDraft(value ?? "")}
      className={`${displayClass} text-left ${value === undefined ? "text-ink-600 italic" : ""} ${className}`}
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
