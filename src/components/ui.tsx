import { useEffect, useState, type ComponentProps, type ReactNode } from "react";

// Hand-rolled primitives. Small enough to read in one sitting, and they keep the
// ops-tool look (dense rows, quiet chrome, loud problems) consistent everywhere.

const BUTTON_VARIANTS = {
  primary:
    "bg-emerald-500 text-emerald-950 hover:bg-emerald-400 focus-visible:outline-emerald-400",
  secondary:
    "bg-slate-800 text-slate-100 ring-1 ring-inset ring-slate-700 hover:bg-slate-700",
  ghost: "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
} as const;

const BUTTON_SIZES = {
  xs: "h-6 px-2 text-[11px] gap-1",
  sm: "h-7 px-2.5 text-xs gap-1.5",
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
      className={`inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
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
      className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}
    >
      {(title !== undefined || actions !== undefined) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h2>
            {subtitle !== undefined && (
              <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}
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
      <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </span>
      {children}
      {hint !== undefined && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:ring-0 focus:outline-none";

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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label={title}
        className="mt-12 w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">{children}</div>
        {footer !== undefined && (
          <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-xs text-slate-500">{children}</p>;
}
