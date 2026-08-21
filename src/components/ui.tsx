import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

// Hand-rolled primitives. Small enough to read in one sitting, and they keep the
// ops-tool look (dense rows, quiet chrome, loud problems) consistent everywhere.

const BUTTON_VARIANTS = {
  // Tan, not green: green is Delivered everywhere else in the app.
  primary: "bg-sand-400 text-ink-950 hover:bg-sand-300",
  secondary: "bg-ink-800 text-ink-100 ring-1 ring-inset ring-ink-700 hover:bg-ink-700",
  ghost: "text-ink-400 hover:bg-ink-800 hover:text-ink-100",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
} as const;

// Heights step by 4px and every size keeps a finger-sized hit area on touch:
// `min-h` is the real target, the visual box stays dense.
const BUTTON_SIZES = {
  xs: "h-7 min-w-7 px-2 text-2xs gap-1",
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
} as const;

type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
};

export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    />
  );
}

/**
 * Destructive actions ask once, inline. A browser confirm() would break the flow
 * of a live demo, and an undo stack is more than v0 needs.
 */
export function ConfirmButton({
  onConfirm,
  label = "Delete",
  confirmLabel = "Confirm",
  className = "",
  size = "xs",
}: {
  onConfirm: () => void;
  label?: ReactNode;
  confirmLabel?: string;
  className?: string;
  size?: keyof typeof BUTTON_SIZES;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      size={size}
      variant={armed ? "danger" : "ghost"}
      className={className}
      title={armed ? "Click again to confirm" : "Delete"}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </Button>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60 ${className}`}
    >
      {(title !== undefined || actions !== undefined) && (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-ink-800 bg-ink-900/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-ink-100">{title}</h2>
            {subtitle !== undefined && (
              <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Pill({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

/** A form row in the modals: label above, control below. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-2xs font-semibold tracking-wide text-ink-400 uppercase">
        {label}
      </span>
      {children}
      {hint !== undefined && <span className="text-2xs text-ink-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1.5 text-sm text-ink-100 placeholder:text-ink-600 focus:border-sand-500 focus:ring-0 focus:outline-none";

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-label={title}
        className="mt-6 w-full max-w-lg rounded-xl border border-ink-700 bg-ink-900 shadow-2xl shadow-ink-950/80 sm:mt-12"
      >
        <header className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
          <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">{children}</div>
        {footer !== undefined && (
          <footer className="flex justify-end gap-2 border-t border-ink-800 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Nothing here — said properly. An empty list is a state the tool is *in*, not a
 * gap in the page, so it gets a headline, a sentence explaining what would put
 * something here, and where possible the button that does it.
 *
 * `tone="good"` is for the empty states that are wins rather than to-dos:
 * nothing unassigned, nothing blocked, nothing late.
 */
export function EmptyState({
  title,
  children,
  action,
  tone = "quiet",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "quiet" | "good";
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <span
        aria-hidden
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
          tone === "good"
            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 ring-inset"
            : "bg-ink-800/80 text-ink-500 ring-1 ring-ink-700/70 ring-inset"
        }`}
      >
        {tone === "good" ? "✓" : "○"}
      </span>
      <p
        className={`text-sm font-medium ${
          tone === "good" ? "text-emerald-200" : "text-ink-300"
        }`}
      >
        {title}
      </p>
      {children !== undefined && (
        <p className="max-w-sm text-xs leading-relaxed text-ink-500">{children}</p>
      )}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * A placeholder the size of the thing that is coming. Convex resolves a query in
 * a blink on a warm connection, so the point is not to entertain anyone — it is
 * that the page does not jump when the data lands.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`animate-settle block rounded-md bg-ink-800/70 ${className}`}
    />
  );
}
