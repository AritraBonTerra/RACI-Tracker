import { ConvexError } from "convex/values";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Rules the backend enforces (a blocked task needs a reason, a chain with plans
// cannot be deleted) are only useful if the person clicking sees why the click
// did nothing. Every mutation goes through `useReportedMutation`, so a rejected
// write becomes a message on screen rather than a console warning.

type Toast = { id: number; message: string; tone: "error" | "info" };

type Notify = (message: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<Notify>(() => {});

/** Pulls the human-readable half out of a Convex failure. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : "That change was rejected.";
  }
  if (error instanceof Error) {
    // Convex wraps server errors; the useful sentence is the first line.
    const [first] = error.message.split("\n");
    return first ?? "Something went wrong.";
  }
  return "Something went wrong.";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((message, tone = "error") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-6">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto max-w-lg rounded-lg px-4 py-3 text-left text-sm shadow-lg backdrop-blur transition ${
              toast.tone === "error"
                ? "bg-rose-950/90 text-rose-100 ring-1 ring-rose-500/60"
                : "bg-ink-800/95 text-ink-100 ring-1 ring-ink-600"
            }`}
          >
            {toast.message}
          </button>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): Notify {
  return useContext(ToastContext);
}

/**
 * The outcome of a reported mutation. Explicit rather than a nullable return,
 * because plenty of these mutations legitimately resolve to nothing and callers
 * still need to know whether to close the editor.
 */
export type MutationResult<Value> = { ok: true; value: Value } | { ok: false };

/**
 * A Convex mutation whose rejections land in a toast instead of an unhandled
 * rejection, so a refused write (blocked task with no reason, chain still in
 * use) explains itself on screen.
 */
export function useReportedMutation<Mutation extends FunctionReference<"mutation">>(
  reference: Mutation,
) {
  const mutate = useMutation(reference);
  const notify = useToast();

  return useMemo(
    () =>
      async (
        args: FunctionArgs<Mutation>,
      ): Promise<MutationResult<FunctionReturnType<Mutation>>> => {
        try {
          return { ok: true, value: await mutate(args) };
        } catch (error) {
          notify(errorMessage(error));
          return { ok: false };
        }
      },
    [mutate, notify],
  );
}
