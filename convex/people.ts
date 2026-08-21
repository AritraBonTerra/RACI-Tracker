import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { mustGet, optionalText, requiredText } from "./model";

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
