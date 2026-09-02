import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, authedQuery, visibleTasks } from "./access";
import {
  byEta,
  fromUrl,
  isOverdue,
  mustGet,
  optionalText,
  patched,
  patchedRequiredText,
  patchedText,
  placeResolver,
  requiredText,
  responsiblesOf,
} from "./model";

// Named humans and the stakeholder buckets they belong to. A person is what
// makes a task assigned; a function alone never is (CONTEXT.md: Unassigned).
//
// The directory itself is reference data, readable in full by every signed-in
// User (#22) — a RACI picker that hid half the company would name the wrong
// owner. What a person is *carrying* is not reference data: the load and
// workload numbers are computed over the viewer's own scope, so two people
// looking at the same person can honestly see different totals.

/** People with their function, ordered the way the deck lists the buckets. */
export const list = authedQuery({
  args: {},
  handler: async (ctx) => {
    const functions = await ctx.db.query("functions").collect();
    const byId = new Map(functions.map((fn) => [fn._id, fn]));
    const people = await ctx.db.query("people").collect();

    return people
      .map((person) => ({ ...person, function: byId.get(person.functionId) ?? null }))
      .sort((a, b) => {
        const order = (a.function?.order ?? 99) - (b.function?.order ?? 99);
        return order !== 0 ? order : a.name.localeCompare(b.name);
      });
  },
});

/** The six stakeholder buckets. Reference data; only the display name is editable. */
export const listFunctions = authedQuery({
  args: {},
  handler: async (ctx) => {
    const functions = await ctx.db.query("functions").collect();
    return functions.sort((a, b) => a.order - b.order);
  },
});

/**
 * Every task one person is named on, as Responsible or Accountable or both,
 * picked out of a scan the caller already paid for. Responsible is a list, and
 * no index covers array membership — but every checklist in the system together
 * is a few dozen rows, so one read of the table serves the whole directory.
 * Deduplicated: a task where they are A/R is one row on their plate, not two.
 */
function tasksOf(tasks: readonly Doc<"tasks">[], personId: Id<"people">) {
  const responsible = tasks.filter((task) => responsiblesOf(task).includes(personId));
  const accountable = tasks.filter((task) => task.accountablePersonId === personId);

  const merged = new Map<Id<"tasks">, Doc<"tasks">>();
  for (const task of [...responsible, ...accountable]) merged.set(task._id, task);
  return { responsible, accountable, all: [...merged.values()] };
}

/**
 * The people directory: everyone grouped by Function, each carrying the load
 * that answers "can this person take one more thing?" — how many tasks they are
 * Responsible for, how many they are Accountable for, and how much of it is late.
 */
export const directory = authedQuery({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const functions = (await ctx.db.query("functions").collect()).sort((a, b) => a.order - b.order);
    const people = (await ctx.db.query("people").collect()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const tasks = await visibleTasks(ctx, ctx.scope, await ctx.db.query("tasks").collect());
    const loaded = people.map((person) => {
      const { responsible, accountable, all } = tasksOf(tasks, person._id);
      return {
        person,
        load: {
          responsible: responsible.length,
          accountable: accountable.length,
          open: all.filter((task) => task.status !== "delivered").length,
          overdue: all.filter((task) => isOverdue(task, args.today)).length,
          blocked: all.filter((task) => task.status === "blocked").length,
        },
      };
    });

    return functions.map((fn) => ({
      function: fn,
      people: loaded.filter((entry) => entry.person.functionId === fn._id),
    }));
  },
});

/**
 * One person's plate, for the drill-down: their tasks across every tier with
 * enough context to link back to the page each one is edited on.
 */
export const workload = authedQuery({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { personId: v.string(), today: v.string() },
  handler: async (ctx, args) => {
    const person = await fromUrl(ctx, "people", args.personId);
    if (person === null) return null;

    const placeOf = placeResolver(ctx);
    const { responsible, accountable, all } = tasksOf(
      await visibleTasks(ctx, ctx.scope, await ctx.db.query("tasks").collect()),
      person._id,
    );
    const responsibleIds = new Set(responsible.map((task) => task._id));
    const accountableIds = new Set(accountable.map((task) => task._id));

    return {
      person,
      function: await ctx.db.get(person.functionId),
      tasks: await Promise.all(
        [...all].sort(byEta).map(async (task) => ({
          task,
          place: await placeOf(task),
          isResponsible: responsibleIds.has(task._id),
          isAccountable: accountableIds.has(task._id),
        })),
      ),
    };
  },
});

// Every write to the People directory is an Administrator's (#22, story 29).
// The directory is readable by everyone — a RACI picker that hid half the
// company would make somebody name the wrong owner — but a Person is the thing
// RACI points at across the whole tool, so who is in it stays governed.
export const renameFunction = adminMutation({
  args: { functionId: v.id("functions"), name: v.string() },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.functionId, "function");
    await ctx.db.patch(args.functionId, {
      ...ctx.stamp,
      name: requiredText(args.name, "Function name"),
    });
  },
});

export const create = adminMutation({
  args: {
    name: v.string(),
    functionId: v.id("functions"),
    title: v.optional(v.string()),
    email: v.optional(v.string()),
    organization: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.functionId, "function");
    return await ctx.db.insert("people", {
      name: requiredText(args.name, "Person name"),
      functionId: args.functionId,
      title: optionalText(args.title),
      email: optionalText(args.email),
      organization: optionalText(args.organization),
      ...ctx.stamp,
    });
  },
});

export const update = adminMutation({
  args: {
    personId: v.id("people"),
    name: v.optional(v.string()),
    functionId: v.optional(v.id("functions")),
    title: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    organization: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const person = await mustGet(ctx, args.personId, "person");
    if (args.functionId !== undefined) await mustGet(ctx, args.functionId, "function");

    await ctx.db.patch(person._id, {
      ...ctx.stamp,
      name: patchedRequiredText(args.name, person.name, "Person name"),
      functionId: patched(args.functionId, person.functionId),
      title: patchedText(args.title, person.title),
      email: patchedText(args.email, person.email),
      organization: patchedText(args.organization, person.organization),
    });
  },
});

/**
 * Deleting a person who is Responsible somewhere would silently push tasks into
 * the Unassigned state the tool exists to surface, so it is refused instead.
 * Consulted / Informed mentions carry no such weight and are simply dropped, so
 * no task is left pointing at a person who is gone.
 *
 * A person carrying a sign-in is refused for the same reason: deleting them
 * would leave the account pointing at nothing, which reads on the Directory as
 * an unlink nobody performed and no Audit event explains (#34). Unlink first,
 * which is one click and is recorded.
 */
export const remove = adminMutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").collect();
    const { all } = tasksOf(tasks, args.personId);

    const held = all.length;
    if (held > 0) {
      throw new ConvexError(
        `This person is Responsible or Accountable on ${held} task(s). Reassign those first.`,
      );
    }

    const linked = await ctx.db
      .query("users")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .first();
    if (linked !== null) {
      throw new ConvexError(
        "This person is linked to a sign-in account. Unlink them in the Directory first.",
      );
    }

    for (const task of tasks) {
      const consultedPersonIds = task.consultedPersonIds.filter((id) => id !== args.personId);
      const informedPersonIds = task.informedPersonIds.filter((id) => id !== args.personId);
      if (
        consultedPersonIds.length !== task.consultedPersonIds.length ||
        informedPersonIds.length !== task.informedPersonIds.length
      ) {
        await ctx.db.patch(task._id, { ...ctx.stamp, consultedPersonIds, informedPersonIds });
      }
    }
    await ctx.db.delete(args.personId);
  },
});
