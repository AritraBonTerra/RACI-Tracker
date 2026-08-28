# Context

Glossary for the RACI promotion tracker — a tool for Viña Concha y Toro USA's
Integrated Commercial Cycle. Terms here are canonical; use them in code, UI, and
conversation.

## Glossary

- **Plan Year** (formerly "Season") — the planning year (e.g. "2026") for one
  Integrated Commercial Cycle; exactly one per calendar year. Carries the
  company-wide phase 0 work (targets, portfolio strategy, brand calendar, trade
  budget).
- **Chain** — a retail account: Safeway, Albertsons, Ralphs, Kroger, …
- **Chain Plan** — one Chain × one Plan Year. Carries phases 1–4: internal
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
- **Task Template** — the default checklist for a phase: one global menu (not
  chain-specific), editable in-app, stamped onto a new Plan Year, Chain Plan,
  or Promotion at creation.
- **Function** — a stakeholder bucket: Commercial Strat Account, Marketing,
  Retail Marketing / Local Sales, Finance (internal); Distributor, Buyer
  (external).
- **Person** — a named human belonging to a Function. Created in-app; never a
  login account. A Person may be *linked* to a User, which is orientation, not
  access — RACI names People and never grants anything.
- **User** — one signed-in identity, created on first Microsoft sign-in and
  never pre-provisioned. Either an **Administrator** (reaches and manages
  everything) or a **Member** (sees exactly their Access Assignments). Active
  or deactivated; deactivation is the immediate kill switch and preserves the
  role and grants a reactivation restores.
- **Access Assignment** — one Member granted one Plan Year, Chain Plan, or
  Promotion. Access flows *down* the hierarchy, a Member's access is the union
  of their assignments, and overlapping assignments are harmless. Records
  outside them are absent, not greyed out: an out-of-scope link answers exactly
  as a deleted one does.
- **Reach** — how far a viewer sees one record of the hierarchy, and the only
  three states the interface has for it. **Full**: the record and its content —
  a link, its checklist, its rollups. **Context**: an ancestor of something
  granted, so the *name* shows for orientation and nothing else — a plain
  label, never a link, never a phase or a count. **None**: absent, and
  indistinguishable from deleted. Administrators reach everything in full.
- **Audit event** — one access-management action (role change, grant, revoke,
  activation, deactivation, Person link) with its actor and timestamp, kept
  indefinitely. Ordinary record edits are not audited; they carry a
  last-modified stamp instead.
- **Last edited** — the stamp every ordinary record edit leaves: which User
  wrote it and when, shown on the plan work — the three tiers, tasks, the KPI
  table and the Retro. Reference data (chains, brands, People, Functions, Task
  Templates) carries the stamp but does not show it: those rows are the
  Administrator's alone to edit, so "who last touched this" is a question with
  one plausible answer. One per record, always overwritten, never a history —
  that is what the Audit event is for, and the Audit event covers access only.
- **RACI** — per task: **Responsible** does the work — one or more named
  People, and a task needs at least one to count as assigned. **Accountable**
  owns the outcome — always exactly one Person, the one you chase when a task
  is late; there is no "lead" among the Responsibles. **Consulted** gives input
  before decisions, **Informed** is kept up to date. The deck's slide-16 matrix
  provides function-level defaults per phase.
- **Unassigned** — derived state: a task with zero named Responsibles. The red
  state the whole tool exists to surface. A named-A gap is a softer warning.
- **Status** — Not started → In progress → Delivered, plus **Blocked** (requires
  a reason — "no inventory at distributor" must scream, not hide).
- **ETA** — a task's due date. **Overdue** — past ETA and not Delivered.
- **Pathway** — the always-visible strip at the top of the Plan Year, Chain Plan,
  and Promotion views: every phase in sequence with its % delivered and phase
  window, a "you are here" marker on the current phase, and one headline call
  to action. Red = overdue work or a passed window; amber = window ends within
  a week and the phase isn't done. Visual only — it never gates anything.
- **Phase window** — the derived date range of a Phase; never stored. Anchored
  by dates that already exist (a Promotion's start/end window, a Chain Plan's
  JBP date) and refined by the min→max ETAs of the phase's tasks. A phase with
  neither anchor nor ETAs is *unscheduled*, not guessed.
- **KPI entry** — manually typed phase-7 numbers per promotion: Depletions, POS
  data, CWD, $/Store/Wk, $ investment × Baseline / Promotional period / Uplift.
- **Retro** — the phase-8 review on a promotion: worked / didn't / repeat next
  year, feeding the next Plan Year's plan.
