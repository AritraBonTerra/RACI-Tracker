# Context

Glossary for the RACI promotion tracker — a tool for Viña Concha y Toro USA's
Integrated Commercial Cycle. Terms here are canonical; use them in code, UI, and
conversation.

## Glossary

- **Season** — a planning year (e.g. "2026"). Carries the company-wide phase 0
  work (targets, portfolio strategy, brand calendar, trade budget).
- **Chain** — a retail account: Safeway, Albertsons, Ralphs, Kroger, …
- **Chain Plan** — one Chain × one Season. Carries phases 1–4: internal
  alignment → distributor alignment → JBP & negotiation → agreement.
- **Promotion** — an approved program under a Chain Plan: one Chain, one or more
  Brands, a date window, a program name. Carries phases 5–8: activation
  planning → retail execution → tracking & measurement → review.
- **Brand** — what is being promoted (e.g. Fetzer, the Mendocino line). A
  maintained list; placeholder entries until real data is loaded.
- **Phase** — one of the nine steps (0–8) of the Integrated Commercial Cycle.
- **Task** — a unit of work on a phase checklist ("shelf talkers, 32 in,
  qty 20"). Has a spec, an optional quantity, an ETA, RACI assignments, and a
  status. The deck's slide 11 rows are the seed menu.
- **Function** — a stakeholder bucket: Commercial Strat Account, Marketing,
  Retail Marketing / Local Sales, Finance (internal); Distributor, Buyer
  (external).
- **Person** — a named human belonging to a Function. Created in-app; not a
  login account in v0.
- **RACI** — per task: **Responsible** does the work (a task needs a *named*
  Person as R to count as assigned), **Accountable** owns the outcome,
  **Consulted** gives input before decisions, **Informed** is kept up to date.
  The deck's slide-16 matrix provides function-level defaults per phase.
- **Unassigned** — derived state: a task with no named Responsible. The red
  state the whole tool exists to surface. A named-A gap is a softer warning.
- **Status** — Not started → In progress → Delivered, plus **Blocked** (requires
  a reason — "no inventory at distributor" must scream, not hide).
- **ETA** — a task's due date. **Overdue** — past ETA and not Delivered.
- **KPI entry** — manually typed phase-7 numbers per promotion: Depletions, POS
  data, CWD, $/Store/Wk, $ investment × Baseline / Promotional period / Uplift.
- **Retro** — the phase-8 review on a promotion: worked / didn't / repeat next
  year, feeding the next Season's plan.
