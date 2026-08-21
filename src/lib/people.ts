import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// The people directory is read by nearly every view (a task shows who is
// Responsible, a picker groups them by Function), so it is fetched once and
// shaped once here rather than joined per row on the server.

export type Person = FunctionReturnType<typeof api.people.list>[number];

export type PeopleDirectory = {
  list: readonly Person[];
  byId: ReadonlyMap<Id<"people">, Person>;
  byFunction: ReadonlyArray<{ name: string; people: readonly Person[] }>;
};

const EMPTY: readonly Person[] = [];

export function usePeople(): PeopleDirectory {
  const loaded = useQuery(api.people.list);
  const list = loaded ?? EMPTY;

  return useMemo(() => {
    const byId = new Map(list.map((person) => [person._id, person]));

    // `list` already arrives ordered by function, so grouping is a single pass.
    const byFunction: Array<{ name: string; people: Person[] }> = [];
    for (const person of list) {
      const name = person.function?.name ?? "Unassigned function";
      const group = byFunction.at(-1);
      if (group?.name === name) group.people.push(person);
      else byFunction.push({ name, people: [person] });
    }

    return { list, byId, byFunction };
  }, [list]);
}
