import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  byEta,
  isOverdue,
  mustGet,
  optionalText,
  placeResolver,
  requiredText,
} from "./model";

// Named humans and the stakeholder buckets they belong to. A person is what
// makes a task assigned; a function alone never is (CONTEXT.md: Unassigned).

/** People with their function, ordered the way the deck lists the buckets. */
export const list = query({
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
export const listFunctions = query({
  args: {},
  handler: async (ctx) => {
    const functions = await ctx.db.query("functions").collect();
    return functions.sort((a, b) => a.order - b.order);
  },
});

/**
 * Every task one person is named on, as Responsible or Accountable or both.
 * Deduplicated: a task where they are A/R is one row on their plate, not two.
 */
async function tasksOf(ctx: QueryCtx, personId: Id<"people">) {
  const responsible = await ctx.db
    .query("tasks")
    .withIndex("by_responsible", (q) => q.eq("responsiblePersonId", personId))
    .collect();
  const accountable = await ctx.db
    .query("tasks")
    .withIndex("by_accountable", (q) => q.eq("accountablePersonId", personId))
    .collect();

  const merged = new Map<Id<"tasks">, Doc<"tasks">>();
  for (const task of [...responsible, ...accountable]) merged.set(task._id, task);
  return { responsible, accountable, all: [...merged.values()] };
}

/**
 * The people directory: everyone grouped by Function, each carrying the load
 * that answers "can this person take one more thing?" — how many tasks they are
 * Responsible for, how many they are Accountable for, and how much of it is late.
 */
export const directory = query({
  args: { today: v.string() },
  handler: async (ctx, args) => {
    const functions = (await ctx.db.query("functions").collect()).sort(
      (a, b) => a.order - b.order,
    );
    const people = (await ctx.db.query("people").collect()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const loaded = await Promise.all(
      people.map(async (person) => {
        const { responsible, accountable, all } = await tasksOf(ctx, person._id);
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
      }),
    );

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
export const workload = query({
  args: { personId: v.id("people"), today: v.string() },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (person === null) return null;

    const placeOf = placeResolver(ctx);
    const { responsible, accountable, all } = await tasksOf(ctx, person._id);
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

export const renameFunction = mutation({
  args: { functionId: v.id("functions"), name: v.string() },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.functionId, "function");
    await ctx.db.patch(args.functionId, { name: requiredText(args.name, "Function name") });
  },
});

export const create = mutation({
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
    });
  },
});

export const update = mutation({
  args: {
    personId: v.id("people"),
    name: v.optional(v.string()),
    functionId: v.optional(v.id("functions")),
    title: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    organization: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await mustGet(ctx, args.personId, "person");
    if (args.functionId !== undefined) await mustGet(ctx, args.functionId, "function");

    await ctx.db.patch(args.personId, {
      ...(args.name === undefined ? {} : { name: requiredText(args.name, "Person name") }),
      ...(args.functionId === undefined ? {} : { functionId: args.functionId }),
      ...(args.title === undefined ? {} : { title: optionalText(args.title) }),
      ...(args.email === undefined ? {} : { email: optionalText(args.email) }),
      ...(args.organization === undefined
        ? {}
        : { organization: optionalText(args.organization) }),
    });
  },
});

/**
 * Deleting a person who is Responsible somewhere would silently push tasks into
 * the Unassigned state the tool exists to surface, so it is refused instead.
 */
export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, args) => {
    const responsible = await ctx.db
      .query("tasks")
      .withIndex("by_responsible", (q) => q.eq("responsiblePersonId", args.personId))
      .collect();
    const accountable = await ctx.db
      .query("tasks")
      .withIndex("by_accountable", (q) => q.eq("accountablePersonId", args.personId))
      .collect();

    const held = responsible.length + accountable.length;
    if (held > 0) {
      throw new ConvexError(
        `This person is Responsible or Accountable on ${held} task(s). Reassign those first.`,
      );
    }
    await ctx.db.delete(args.personId);
  },
});
