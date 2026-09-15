# 4. Editors open Chain Plans and Promotions within their grant

Date: 2026-09-14

## Status

Accepted. Narrows the Administrator-only creation rule from #22 (story 29).

## Context

The strategic accounts team is one lead and six account managers, each owning a
fixed list of retail chains (Adam Szabo: Kroger, Walgreens, ABC Liquors; Travis
Nuckolls: Walmart, Sam's Club, Target; and so on). The tool's first real use is
those managers running their own chains' promotions.

The access model already had the right shape for them: an Editor with a Chain
grant reaches that chain's plans and promotions in every Plan Year, current and
future. What it lacked was the first step. Creating a Chain Plan or a Promotion
was an Administrator's alone, so every promotion an account manager wanted to
run began with a request to an Administrator to open the record the manager
would then own. For six people and fifty-odd chains that is not governance, it
is a queue.

A new role was considered and rejected. "Chain Owner" would carry exactly one
right Editor lacks, and a fourth role means a fourth row in every matrix, a
fourth description in the Directory, and a migration question for the accounts
that already exist.

## Decision

Opening a record follows the same rule as writing one: the parent decides.

- An Editor whose scope covers a Chain Plan **in full** may create Promotions
  under it. That is a Chain Plan grant, a Chain grant, or a Plan Year grant.
- An Editor who holds the **Plan Year** in full, or holds the **Chain** itself,
  may create that chain's Chain Plan in that year. The gate is
  `writablePlanSlot` in `convex/access.ts`; `Scope` gained `chain(chainId)` to
  answer the second half.
- So that a Chain holder has somewhere to start from, a Chain grant now names
  **every** Plan Year as context, not only the years where the chain already
  has a plan, and the navigation tree lists the held, planless chain under the
  year as the "start one here" affordance. Viewers holding a chain see neither.

Everything else stays where it was. Creating Plan Years, deleting a Chain
Plan or Promotion (tasks were already the Editor's to delete), and all
reference data (chains, brands, People, Functions, Task Templates)
remain Administrator-only. The Editor's "new chain" shortcut in the plan modal
is hidden, because naming a chain is reference data.

A refused create fails exactly as a write to a deleted parent does: a plan-only
Editor starting a plan elsewhere gets "That season no longer exists.", never a
sentence that names the rule they hit (#27, scenario 15).

## Consequences

- Account managers are onboarded as Editors with one Chain grant per chain
  they own, from the Directory, and can start the year's plan and its
  promotions themselves. No new role, no schema change, no migration.
- A Plan Year Editor can now open plans for any chain in their year. Before,
  the same person could edit every task under the year but not add a plan to
  it; the asymmetry was the odder state.
- Deleting a plan or promotion is still an Administrator's. An Editor who opens a promotion by
  mistake asks an Administrator to remove it. If that becomes a queue of its
  own, extending `remove` along the same rule is a one-gate change.
- `scopedWrites` and `chainAccess` carry the matrix: who opens what, and that
  the refusals are indistinguishable from missing records.
