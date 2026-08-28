import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authedQuery, readablePromotion } from "./access";
import { kpiMetric, repeatVerdict } from "./schema";
import { mustGet, optionalText } from "./model";

// Phase 7 (tracking & measurement) and phase 8 (review) for one promotion: the
// slide-14 KPI grid and the retro that reads it.
//
// Detachable by design (#14). This file owns both concerns end to end; the rest
// of the app touches it in three places — two tables in `schema.ts`, two render
// sites in `PromotionView`, and one cleanup call in `promotions.remove`.
//
// Everything here is typed by hand. There are no data integrations, so the tool
// never invents a number: a blank cell means nobody has pulled the figure yet,
// which is itself the phase-7 status worth seeing.

/** The absolute and percentage change between the two columns of one KPI row. */
export type Uplift = { absolute: number; percent: number | null };

/**
 * Uplift is derived, never stored, and only where both columns hold a number —
 * "promotional period minus baseline" is meaningless when one of them is a
 * guess or a blank. Percent is null against a zero baseline: a jump from
 * nothing is infinite growth, and infinity in a cell reads as a bug.
 */
function upliftOf(entry: Doc<"kpiEntries">): Uplift | null {
  const { baseline, promotional } = entry;
  if (baseline === undefined || promotional === undefined) return null;
  const absolute = promotional - baseline;
  return {
    absolute,
    percent: baseline === 0 ? null : (absolute / baseline) * 100,
  };
}

async function entryFor(
  ctx: QueryCtx,
  promotionId: Id<"promotions">,
  metric: Doc<"kpiEntries">["metric"],
) {
  return await ctx.db
    .query("kpiEntries")
    .withIndex("by_promotion_and_metric", (q) =>
      q.eq("promotionId", promotionId).eq("metric", metric),
    )
    .first();
}

async function retroFor(ctx: QueryCtx, promotionId: Id<"promotions">) {
  return await ctx.db
    .query("retros")
    .withIndex("by_promotion", (q) => q.eq("promotionId", promotionId))
    .first();
}

/**
 * Everything the phase-7 and phase-8 panels draw, in one subscription: the KPI
 * rows that exist (the client lays them out against the fixed slide-14 grid)
 * with their computed uplift, and the retro if one has been started.
 *
 * Null when the promotion no longer resolves or the viewer's scope does not
 * reach it — phase 7-8 figures are the promotion's content, and a stale link
 * and a denied one degrade the same way the rest of the app does.
 */
export const board = authedQuery({
  // A string, not `v.id`: the id comes from the hash (model.ts: fromUrl).
  args: { promotionId: v.string() },
  handler: async (ctx, args) => {
    const promotion = await readablePromotion(ctx, ctx.scope, args.promotionId);
    if (promotion === null) return null;

    const entries = await ctx.db
      .query("kpiEntries")
      .withIndex("by_promotion", (q) => q.eq("promotionId", promotion._id))
      .collect();

    return {
      metrics: entries.map((entry) => ({ ...entry, uplift: upliftOf(entry) })),
      retro: await retroFor(ctx, promotion._id),
    };
  },
});

// Patch semantics shared by both mutations: an argument left off means "leave
// this alone", and an explicit null means "clear it". Clicking into a cell,
// deleting the contents and tabbing away has to remove the figure, not leave
// the last value sitting there.

function patched<Value>(arg: Value | null | undefined, current: Value | undefined) {
  return arg === undefined ? current : (arg ?? undefined);
}

/** As `patched`, but whitespace-only text counts as clearing the field. */
function patchedText(arg: string | null | undefined, current: string | undefined) {
  return arg === undefined ? current : optionalText(arg);
}

/** A typed figure has to be a real number — "1,240" and "n/a" belong in a note. */
function patchedNumber(
  arg: number | null | undefined,
  current: number | undefined,
  field: string,
) {
  if (arg === undefined) return current;
  if (arg === null) return undefined;
  if (!Number.isFinite(arg)) throw new ConvexError(`${field} must be a number.`);
  return arg;
}

/**
 * Writes one cell of the KPI grid, creating the row on first entry. A row whose
 * every field has been cleared is deleted rather than left as an empty husk, so
 * the table only ever holds figures somebody actually typed.
 */
export const setMetric = mutation({
  args: {
    promotionId: v.id("promotions"),
    metric: kpiMetric,
    baseline: v.optional(v.union(v.number(), v.null())),
    promotional: v.optional(v.union(v.number(), v.null())),
    upliftOverride: v.optional(v.union(v.string(), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const promotion = await mustGet(ctx, args.promotionId, "promotion");
    const existing = await entryFor(ctx, promotion._id, args.metric);

    const fields = {
      baseline: patchedNumber(args.baseline, existing?.baseline, "Baseline"),
      promotional: patchedNumber(
        args.promotional,
        existing?.promotional,
        "Promotional period",
      ),
      upliftOverride: patchedText(args.upliftOverride, existing?.upliftOverride),
      note: patchedText(args.note, existing?.note),
    };

    const empty = Object.values(fields).every((value) => value === undefined);
    if (empty) {
      if (existing !== null) await ctx.db.delete(existing._id);
      return;
    }

    if (existing === null) {
      await ctx.db.insert("kpiEntries", {
        promotionId: promotion._id,
        metric: args.metric,
        ...fields,
      });
    } else {
      await ctx.db.patch(existing._id, fields);
    }
  },
});

/** Writes the phase-8 retro, creating it on the first sentence anyone types. */
export const saveRetro = mutation({
  args: {
    promotionId: v.id("promotions"),
    worked: v.optional(v.union(v.string(), v.null())),
    didntWork: v.optional(v.union(v.string(), v.null())),
    repeatNextYear: v.optional(v.union(repeatVerdict, v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const promotion = await mustGet(ctx, args.promotionId, "promotion");
    const existing = await retroFor(ctx, promotion._id);

    const fields = {
      worked: patchedText(args.worked, existing?.worked),
      didntWork: patchedText(args.didntWork, existing?.didntWork),
      repeatNextYear: patched(args.repeatNextYear, existing?.repeatNextYear),
      notes: patchedText(args.notes, existing?.notes),
    };

    const empty = Object.values(fields).every((value) => value === undefined);
    if (empty) {
      if (existing !== null) await ctx.db.delete(existing._id);
      return;
    }

    if (existing === null) {
      await ctx.db.insert("retros", { promotionId: promotion._id, ...fields });
    } else {
      await ctx.db.patch(existing._id, fields);
    }
  },
});

/**
 * Drops a promotion's measurement rows along with the promotion itself. Called
 * from `promotions.remove`; that call is the only line elsewhere in the backend
 * that has to go if this feature is detached.
 */
export async function removeForPromotion(
  ctx: MutationCtx,
  promotionId: Id<"promotions">,
) {
  const entries = await ctx.db
    .query("kpiEntries")
    .withIndex("by_promotion", (q) => q.eq("promotionId", promotionId))
    .collect();
  for (const entry of entries) await ctx.db.delete(entry._id);

  const retro = await retroFor(ctx, promotionId);
  if (retro !== null) await ctx.db.delete(retro._id);
}
