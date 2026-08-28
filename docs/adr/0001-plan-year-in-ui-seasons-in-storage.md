# 1. "Plan Year" in the UI, `seasons` in storage

Date: 2026-08-21

## Status

Accepted

## Context

The top tier of the model was called **Season**, defined in the glossary as "a
planning year" and enforced by the schema as exactly one per calendar year
(`seasons.by_year` unique). The word confused its own users — "I don't even
understand why it's called seasons" — because nothing seasonal ever happens:
the Integrated Commercial Cycle runs once per year, and the deck itself is the
"2026 Integrated Commercial Process".

Renaming the concept raised the question of how far the rename goes:

1. **Rename everything** — table, indexes, code identifiers, routes, UI. Convex
   has no table-rename primitive, so this means a copy-table migration on a
   production deployment that auto-deploys from `main`, plus breaking every
   existing `#/season/<id>` link.
2. **Rename the UI and glossary only** — users see "Plan Year" / "Year";
   the table stays `seasons`, code keeps `seasonId`, routes keep `#/season/`.

## Decision

Option 2. The canonical domain term is **Plan Year** (CONTEXT.md). Everything
user-facing says "year". The storage table, code identifiers, and route
segments keep the `season` name.

## Consequences

- No data migration, no broken links, no churn across every file that touches
  `seasonId`.
- A permanent mismatch: a reader grepping for "plan year" finds UI strings, not
  the table. This ADR is the bridge — `seasons` *is* the Plan Year table.
- If a real seasonal split ever arrives (two cycles in one calendar year), the
  storage name becomes accurate again and only UI copy needs revisiting.
