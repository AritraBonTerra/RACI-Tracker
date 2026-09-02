import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { type PhaseNumber, ROLE_LETTER } from "./domain";

// The slide-16 matrix, client side. It is read by every RACI editor, so it is
// fetched once (Convex dedupes the subscription) and shaped into the two
// questions a picker asks: "what does this phase expect?" and "which functions
// should be at the top of the list?".

export type RaciCell = FunctionReturnType<typeof api.raci.matrix>[number]["cells"][number];
export type RaciRole = RaciCell["roles"][number];

/** How each role is named on screen; the letter is the one in `ROLE_LETTER`. */
export const ROLE_META = {
  responsible: { letter: ROLE_LETTER.responsible, label: "Responsible", hint: "does the work" },
  accountable: { letter: ROLE_LETTER.accountable, label: "Accountable", hint: "owns the outcome" },
  consulted: { letter: ROLE_LETTER.consulted, label: "Consulted", hint: "asked before decisions" },
  informed: { letter: ROLE_LETTER.informed, label: "Informed", hint: "kept up to date" },
} as const satisfies Record<RaciRole, { letter: string; label: string; hint: string }>;

const NO_CELLS: readonly RaciCell[] = [];
const NO_FUNCTIONS: ReadonlySet<Id<"functions">> = new Set();

export type RaciMatrix = {
  loaded: boolean;
  /** The whole matrix row for a phase: which function plays which role. */
  cellsFor: (phase: PhaseNumber) => readonly RaciCell[];
  /** Just the functions expected to play one role — the picker's short list. */
  functionsFor: (phase: PhaseNumber, role: RaciRole) => ReadonlySet<Id<"functions">>;
};

export function useRaciMatrix(): RaciMatrix {
  const matrix = useQuery(api.raci.matrix);

  return useMemo(() => {
    const byPhase = new Map<PhaseNumber, readonly RaciCell[]>(
      (matrix ?? []).map((row) => [row.phase, row.cells]),
    );

    const cellsFor = (phase: PhaseNumber) => byPhase.get(phase) ?? NO_CELLS;

    return {
      loaded: matrix !== undefined,
      cellsFor,
      functionsFor: (phase, role) => {
        const cells = cellsFor(phase);
        if (cells.length === 0) return NO_FUNCTIONS;
        return new Set(
          cells.filter((cell) => cell.roles.includes(role)).map((cell) => cell.functionId),
        );
      },
    };
  }, [matrix]);
}
