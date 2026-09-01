import type { Doc, Id } from "../../convex/_generated/dataModel";

// The brand chips on a promotion: one toggle per maintained brand. Used by the
// new-promotion form and the edit-brands modal so they cannot drift apart.

export function BrandToggles({
  brands,
  selected,
  onToggle,
}: {
  /** Undefined while the brand list is still loading. */
  brands: readonly Doc<"brands">[] | undefined;
  selected: ReadonlyArray<Id<"brands">>;
  onToggle: (brandId: Id<"brands">) => void;
}) {
  if (brands === undefined) {
    return <p className="text-2xs text-ink-500">Loading brands…</p>;
  }
  if (brands.length === 0) {
    return <p className="text-2xs text-ink-500">No brands yet — add them in Manage.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {brands.map((brand) => {
        const on = selected.includes(brand._id);
        return (
          <button
            key={brand._id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(brand._id)}
            className={`rounded-full px-2.5 py-1 text-xs transition ${
              on
                ? "bg-sand-400/20 text-sand-100 ring-1 ring-sand-400/60"
                : "bg-ink-800 text-ink-400 ring-1 ring-ink-700 hover:text-ink-200"
            }`}
          >
            {brand.name}
          </button>
        );
      })}
    </div>
  );
}
