import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Walking-skeleton page: renders a message served live by the Convex backend,
// proving the Vercel → Convex Cloud pipeline end to end before any features exist.
export default function App() {
  const status = useQuery(api.hello.status);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">RACI Tracker</h1>
        <p className="mt-1 text-sm text-slate-400">
          Promotion tracking, from season to shelf.
        </p>
        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-4">
          {status === undefined ? (
            <p className="text-sm text-slate-500">Connecting to backend…</p>
          ) : (
            <>
              <p className="text-sm text-emerald-400">{status.message}</p>
              <p className="mt-1 text-xs text-slate-500">
                Served by Convex at {new Date(status.serverTime).toLocaleString()}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
