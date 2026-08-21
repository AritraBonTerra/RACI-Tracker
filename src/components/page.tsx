import type { ReactNode } from "react";
import { href, type Route } from "../lib/router";

// Page furniture shared by the three tier views.

export function Breadcrumb({
  trail,
}: {
  trail: ReadonlyArray<{ label: string; to?: Route }>;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      {trail.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-slate-700">/</span>}
          {crumb.to === undefined ? (
            <span>{crumb.label}</span>
          ) : (
            <a href={href(crumb.to)} className="hover:text-slate-200">
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
    <header className="border-b border-slate-800 pb-4">
      {eyebrow}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-slate-50">{title}</h1>
        {actions !== undefined && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {meta !== undefined && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          {meta}
        </div>
      )}
      {children}
    </header>
  );
}

/** A label/value pair on a page header's meta row. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold tracking-wider text-slate-600 uppercase">
        {label}
      </span>
      <span className="text-slate-300">{children}</span>
    </span>
  );
}

/** A link that outlived what it pointed at — deleted, or reseeded underneath. */
export function NotFound({ what }: { what: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-slate-400">
        That {what} no longer exists. It may have been deleted.
      </p>
      <a
        href="#/"
        className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
      >
        Back to the season
      </a>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-sm text-slate-600">
      Loading {what}…
    </div>
  );
}
