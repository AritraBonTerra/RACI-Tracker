import { useState } from "react";

// A long list shown a few at a time. Every surface that lists the chain plans
// folds the same way: the first few, a count of the rest, one click to open.
// The fold is session state, not saved — a fresh visit starts short again.

/**
 * The first `limit` items, plus any item `pinned` says must stay visible even
 * past the fold (the sidebar's current page), until the reader opens it.
 */
export function useFold<T>(items: readonly T[], limit: number, pinned?: (item: T) => boolean) {
  const [expanded, setExpanded] = useState(false);
  const shown =
    expanded || items.length <= limit
      ? items
      : [...items.slice(0, limit), ...items.slice(limit).filter((item) => pinned?.(item) ?? false)];
  return {
    shown,
    hidden: items.length - shown.length,
    expanded,
    toggle: () => setExpanded((current) => !current),
    /** Back to the short list, for when the list behind the fold changes shape. */
    collapse: () => setExpanded(false),
  };
}

/**
 * The button under a folded list. Renders nothing when there is nothing to
 * fold, so callers can drop it in unconditionally.
 */
export function FoldButton({
  hidden,
  expanded,
  noun,
  onToggle,
  className = "",
}: {
  hidden: number;
  expanded: boolean;
  /** Plural: "chain plans". */
  noun: string;
  onToggle: () => void;
  className?: string;
}) {
  if (!expanded && hidden === 0) return null;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={`flex items-center justify-center gap-1.5 rounded-md text-2xs font-medium text-ink-400 transition hover:bg-ink-800/60 hover:text-ink-100 ${className}`}
    >
      {expanded ? "Show fewer" : `Show ${hidden} more ${noun}`}
      <span aria-hidden className="text-3xs">
        {expanded ? "▲" : "▼"}
      </span>
    </button>
  );
}
