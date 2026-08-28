import { Component, type ErrorInfo, type ReactNode } from "react";
import { formatStamp } from "../lib/dates";
import { CONTEXT_HINT } from "../lib/domain";
import { href, type Route } from "../lib/router";
import { errorMessage } from "../lib/toast";
import { Button, Skeleton } from "./ui";

// Page furniture shared by the three tier views, plus the placeholders each of
// them shows while its query resolves.

/**
 * The trail above a page title. A crumb is a link when the viewer can open what
 * it names and a plain label otherwise (#24) — so a promotion-only Member reads
 * "2026 / Kroger / Promotion" for orientation and can click none of it. Marking
 * a crumb `context` only changes its tooltip; the absence of `to` is what makes
 * it inert.
 */
export function Breadcrumb({
  trail,
}: {
  trail: ReadonlyArray<{ label: string; to?: Route; context?: boolean }>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-2xs text-ink-500">
      {trail.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-ink-700">/</span>}
          {crumb.to === undefined ? (
            <span
              title={crumb.context === true ? CONTEXT_HINT : undefined}
              className={crumb.context === true ? "cursor-default" : undefined}
            >
              {crumb.label}
            </span>
          ) : (
            <a href={href(crumb.to)} className="transition hover:text-ink-200">
              {crumb.label}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-ink-800 pb-4">
      {eyebrow}
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
        {/* Grows rather than shrink-to-fit, so an editable title does not wrap
            with half the header still empty beside it. */}
        <h1 className="min-w-0 flex-1 text-xl font-semibold tracking-tight text-balance text-ink-50 sm:text-2xl">
          {title}
        </h1>
        {actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {meta !== undefined && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-400">
          {meta}
        </div>
      )}
      {children}
    </header>
  );
}

/**
 * Names for the last-modified stamps in one payload, keyed by User id. Sent
 * alongside the records rather than folded into them, because a checklist of
 * twenty rows edited by two people carries two names (convex/access.ts).
 */
export type Editors = Readonly<Record<string, string>>;

/** A record carrying the stamp every ordinary edit writes (#22, story 28). */
export type Stamped = { lastModifiedBy?: string; lastModifiedAt?: number };

/**
 * The readable half of a record's stamp, or null when there is nothing honest
 * to say: rows written before the stamp existed carry none, and a stamp naming
 * a deleted User resolves to no name.
 *
 * Exported so a caller wrapping `LastEdited` in chrome of its own — a bordered
 * strip, a divider — can ask whether the strip has anything to hold, instead of
 * restating this condition and drifting from it.
 */
export function editorOf(
  record: Stamped,
  editors: Editors,
): { name: string; at: number } | null {
  const name = record.lastModifiedBy === undefined ? undefined : editors[record.lastModifiedBy];
  if (name === undefined || record.lastModifiedAt === undefined) return null;
  return { name, at: record.lastModifiedAt };
}

/**
 * Who last touched this record, and when — the first answer to a data question,
 * short of the audit feed (which is about access, not content).
 *
 * Renders nothing at all for an unstamped record: "Last edited by —" is worse
 * than silence.
 */
export function LastEdited({
  record,
  editors,
  className = "",
}: {
  record: Stamped;
  editors: Editors;
  className?: string;
}) {
  const editor = editorOf(record, editors);
  if (editor === null) return null;
  return (
    <span className={`text-2xs text-ink-600 ${className}`}>
      Last edited by <span className="text-ink-500">{editor.name}</span> ·{" "}
      {formatStamp(editor.at)}
    </span>
  );
}

/** A label/value pair on a page header's meta row. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-3xs font-semibold tracking-wider text-ink-600 uppercase">
        {label}
      </span>
      <span className="text-ink-300">{children}</span>
    </span>
  );
}

/**
 * A link that led nowhere. Deliberately ambiguous, and deliberately the same
 * wording whether the record was deleted or simply outside the viewer's access
 * (#22, #24): the backend already answers both cases with the same null, and a
 * screen that said "you don't have access to this promotion" would confirm the
 * promotion exists — which is the whole thing a denied link must not do.
 *
 * That is also why it takes no argument. "This chain plan is gone" would leak
 * the tier of a record the reader was never told about.
 */
export function NotFound() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800/80 text-base text-ink-500 ring-1 ring-ink-700 ring-inset"
      >
        ⌀
      </span>
      <div>
        <p className="text-sm font-medium text-ink-200">
          This page doesn't exist, or you don't have access to it
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
          The link still works, but there is nothing here for you. If you expected
          something, ask an administrator for access.
        </p>
      </div>
      <a href={href({ name: "home" })}>
        <Button variant="secondary" size="md" tabIndex={-1}>
          Back to the dashboard
        </Button>
      </a>
    </div>
  );
}

/**
 * The last line of defence around one view. Every id in this app arrives off the
 * URL bar, and a query that throws on one would otherwise take the whole page
 * with it — a blank screen with the navigation gone. Reset by keying this on the
 * route, so the next link works.
 */
export class ViewBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    return { message: errorMessage(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn("View failed to render", error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500/15 text-base text-rose-300 ring-1 ring-rose-500/40 ring-inset"
        >
          !
        </span>
        <div>
          <p className="text-sm font-medium text-ink-200">This view could not load</p>
          <p
            className="mx-auto mt-1 max-w-sm text-xs text-ink-500"
            title={this.state.message}
          >
            Nothing was lost. Try the dashboard, or reload the page.
          </p>
        </div>
        <a href={href({ name: "home" })}>
          <Button variant="secondary" size="md" tabIndex={-1}>
            Back to the dashboard
          </Button>
        </a>
      </div>
    );
  }
}

/**
 * A grid of linked cards — chain plans on a season, promotions on a plan. Padded
 * and individually bordered rather than a hairline grid, so a row that does not
 * divide evenly leaves whitespace instead of a dead cell.
 */
export const cardGrid = (count: number) =>
  `grid gap-3 p-3 ${
    count <= 1 ? "" : count <= 4 ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"
  }`;

export const cardClass =
  "rounded-lg border border-ink-800 bg-ink-900/70 p-4 transition hover:border-ink-700 hover:bg-ink-900";

// --- Placeholders ---------------------------------------------------------
//
// Every one of these is built to the geometry of the thing it stands in for, so
// the switch from placeholder to data moves nothing on the page.

/** The header block: breadcrumb, title, meta row. */
export function HeaderSkeleton({ metaCount = 3 }: { metaCount?: number }) {
  return (
    <div className="border-b border-ink-800 pb-4">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-2.5 h-7 w-72 max-w-full" />
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
        {Array.from({ length: metaCount }, (_, index) => (
          <Skeleton key={index} className="h-3 w-28" />
        ))}
      </div>
    </div>
  );
}

/** A checklist section, or any other titled block of rows. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50">
      <div className="border-b border-ink-800 bg-ink-900/60 px-4 py-3">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 border-b border-ink-800/70 px-4 py-3 last:border-b-0"
        >
          <Skeleton className="h-3.5 min-w-0 flex-1" />
          <Skeleton className="hidden h-3.5 w-24 sm:block" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Season, chain-plan and promotion pages all share this shape. */
export function TierSkeleton({ panels = 4 }: { panels?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-800 bg-ink-800 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="bg-ink-900 px-3 py-2.5">
            <Skeleton className="h-6 w-8" />
            <Skeleton className="mt-1.5 h-2.5 w-16" />
          </div>
        ))}
      </div>
      {Array.from({ length: panels }, (_, index) => (
        <PanelSkeleton key={index} rows={index === 0 ? 3 : 2} />
      ))}
    </div>
  );
}
