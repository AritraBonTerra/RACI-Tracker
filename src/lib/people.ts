import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// The people directory is read by nearly every view (a task shows who is
// Responsible, a picker groups them by Function), so it is fetched once and
// shaped once here rather than joined per row on the server.

export type Person = FunctionReturnType<typeof api.people.list>[number];

export type PeopleGroup = {
  functionId: Id<"functions">;
  name: string;
  people: readonly Person[];
};

export type PeopleDirectory = {
  /** False until the first result lands, so an empty list is never mistaken for "nobody yet". */
  loaded: boolean;
  list: readonly Person[];
  byId: ReadonlyMap<Id<"people">, Person>;
  byFunction: readonly PeopleGroup[];
};

const EMPTY: readonly Person[] = [];

export function usePeople(): PeopleDirectory {
  const result = useQuery(api.people.list);
  const loaded = result !== undefined;
  const list = result ?? EMPTY;

  return useMemo(() => {
    const byId = new Map(list.map((person) => [person._id, person]));

    // `list` already arrives ordered by function, so grouping is a single pass.
    const byFunction: Array<{ functionId: Id<"functions">; name: string; people: Person[] }> = [];
    for (const person of list) {
      const group = byFunction.at(-1);
      if (group?.functionId === person.functionId) group.people.push(person);
      else {
        byFunction.push({
          functionId: person.functionId,
          name: person.function?.name ?? "Unassigned function",
          people: [person],
        });
      }
    }

    return { loaded, list, byId, byFunction };
  }, [loaded, list]);
}
