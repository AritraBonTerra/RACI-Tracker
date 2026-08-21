# Tool landscape: what could run the RACI promotion tracker without custom code?

Researched 2026-08-20 by three parallel research agents (generic PM tools ×2, TPM/bev-alc
category ×1). Every claim below is sourced to a vendor page unless flagged otherwise;
prices verified against vendors' own pricing pages on the research date. Context: Viña
Concha y Toro USA, ~10–25 users, tracking chain-level retail promotions with RACI-style
per-deliverable ownership, check-off statuses (unassigned / in progress / delivered),
flexible per-chain deliverable menus, and a cross-promotion dashboard that surfaces
**unassigned** work.

## Executive summary

1. **The trade-promotion-management (TPM) and retail-execution categories do not fit —
   structurally, not just on price.** TPM products model a promotion as a *spend event*
   (accruals, deductions, lift, ROI); retail-execution products model *a rep visiting a
   store*. Neither has "deliverable with a named accountable human, a date, and an
   unassigned rollup" as a first-class entity. Of ~20 vendors surveyed, only three
   publish any price; implementations run months. Verdict: this requirement is a
   structured task tracker with a domain-specific schema — a **build-or-configure
   problem, not a TPM procurement problem**.
2. **Among generic tools, the shortlist is Airtable Team (capability winner) and
   ClickUp Business (value pick).** At 15 seats/yr on the tier that actually unlocks the
   unassigned dashboard: Notion Plus $1,800 (but no dashboard primitive), ClickUp
   Business $2,160, Smartsheet Business $3,420, Monday Pro $3,420, Airtable Team $3,600
   (realistically ~$1,500–2,000 — interface-only viewers are non-billable), Asana
   Advanced $4,498 (hard to justify).
3. **One universal caveat:** none of the vendors formally documents an "is empty"
   filter operator on their people/user field type (Smartsheet's `is blank` is the
   exception). Since the unassigned filter is the killer requirement, any trial must
   verify it on day one; the robust fallback everywhere is a Status field whose default
   value is literally "Unassigned."
4. **Design ideas worth stealing for a custom build:** Monday's multiple named-People-
   columns-per-row; one-table-of-all-deliverables with a relation up to Promotion
   (Airtable's shape); Status defaulting to Unassigned as a first-class state;
   Smartsheet's group-and-summarize "unassigned count by chain."

---

## Part 1 — Generic PM tools

### The shape all of them must express

`Promotion` (chain, dates, approved store list) → many `Deliverables` (type, spec, qty,
ETA, delivered-to, proof photo, status), each carrying four separate named-person fields
(R/A/C/I). Critical design rule in every tool: **all deliverables from all promotions in
ONE table/board/list**, linked up to the promotion — that single table is what makes the
cross-promotion unassigned view trivial.

### Head-to-head at 15 seats (tier that actually meets the requirement)

| | Tier required | $/seat/mo (annual) | **Annual @ 15 seats** | RACI model | Per-chain flexibility | Unassigned dashboard | Setup |
|---|---|---|---|---|---|---|---|
| **Airtable** | Team | $20 | $3,600 (**~$1.4–1.9k** with free interface-viewers) | 4 independent User fields, single/multi toggle per field | Good (free-text spec, extendable selects) | Interface Designer, all tiers; verify empty-User filter | 2–4 days |
| **ClickUp** | Business | $12 | **$2,160** | Assembled: assignee + People fields + followers | **Best** (Space/Folder/List field inheritance) | Real dashboards Business+ ("trial access" below); Everything view on $7 tier ≈ 80% | 3–5 days |
| **Monday** | Pro | $19 | $3,420 (seat buckets: 3,5,10,15,20,30) | **Native** multiple People columns; independent subitem columns | Weakest (board-level schema) | Native; 20-boards-per-dashboard cap on Pro | 2–4 days |
| **Smartsheet** | Business | $19 ⚠ verify live page | $3,420 | Multiple Contact columns; multi-contact cols can't group reports | OK (rows not columns) | **Best documented** (`is blank`, group + summarize, workspace-sourced reports) | 1–3 days |
| **Notion** | Plus | $10 | **$1,800** | Multiple Person properties (documented) | Most permissive (prose + properties) | Filtered linked views only — **no dashboard primitive** | 1–2 days |
| **Asana** | Advanced | $24.99 | **$4,498** | People custom fields (but only native Assignee notifies) | Good (per-project fields) | Universal Reporting — paywalled at Advanced | 2–3 days |

### Verdicts

- **Airtable Team — capability winner.** The only one whose data model matches the
  problem's actual shape: real relational Promotion→Deliverable link, four independent
  User fields, free-text spec absorbing "shelf talkers, 32 inches" with zero schema
  work, Interface Designer dashboard grouped by chain. Interface-only **viewers are
  non-billable** — pay only for the 6–8 editors. Weaknesses: no native
  duplicate-promotion-with-children (copy-paste or scripting automation), and the
  empty-User-field filter is undocumented (formula-field workaround is trivial).
- **ClickUp Business — value pick.** Everything for 37% less than Monday; the
  Space/Folder/List custom-field inheritance is genuinely the right abstraction for
  "the requirement menu varies by chain and isn't documented." Sharp edge: dashboards
  on Free/Unlimited are "trial access" only — the $7 tier looks sufficient and isn't.
  Most configurable = easiest to build badly; budget a throwaway first setup.
- **Monday Pro — best native RACI.** Four named humans per row is the intended design,
  not a workaround; independent subitem columns fit promotion→deliverable exactly.
  Strains: 20-board dashboard cap, seat buckets (25 users likely buys 30 seats),
  per-chain flexible *menus of fields* fight board-level schema.
- **Smartsheet Business — safe institutional choice, wrong seat model.** Only vendor
  documenting the exact requirement (`is blank`), best promotion templating. But free
  Contributors **cannot edit cells**, so every status-updater needs a paid Member seat;
  Pro is a trap (10-member cap, 1-source-sheet reports).
- **Notion Plus — cheapest, most likely to fail the way that already burned the team.**
  No dashboard primitive: the unassigned count is a grey group header, not a red tile.
  No schema coercion ("shelf talker" vs "Shelf Talkers" silently splits counts). 5MB
  file cap kills Free for proof photos.
- **Asana Advanced — polished, priced wrong.** The one needed feature (cross-project
  reporting) sits behind the $24.99 tier; R/A/C/I custom fields are inert (only the
  native Assignee drives notifications and My Tasks).

### Trial checklist (if any is ever demoed)

1. Filter a dashboard/report to *people field is empty* — the literal mechanism behind
   the Kroger-demo failure. Undocumented on Airtable/Notion/Monday/ClickUp/Asana.
2. Clone last year's promotion with its full deliverable set and specs.
3. Monday only: whether a 25-seat block is purchasable or 25 users forces a 30-seat buy.

---

## Part 2 — TPM and beverage-alcohol category

**Bottom line: no product in this category does named-owner-per-activation-deliverable
with an unassigned dashboard for a small team at $10–30k/yr.**

### Enterprise TPM (all disqualified)

Vividly, TELUS Consumer Goods (Blacksmith + Exceedra — note Exceedra is TELUS, not
Kantar), Kantar/XTEL, UpClear BluePlanner, Salesforce Consumer Goods Cloud (+ custom-
priced TPM add-on), Accenture CAS ($120/user/mo on AppExchange = $21,600/yr license
alone before Salesforce base licenses and SI fees), CPGvision, Aforza, Vistex, Flintfox,
SAP TPM. **None but Accenture publishes a price**; all carry accrual/deduction/RGM
machinery irrelevant here; implementations are measured in months (a Salesforce partner
launched a *discounted* TPM SKU in 2025 whose accelerated deployment still takes five
months — the category admitting it overshoots).

### Bev-alc / retail-execution (wrong shape)

These model *a rep standing in a store*, not *a marketing coordinator owning a print
job*: Repsly (closest miss — real tasks with owners/due dates, but scoped to
stores/field reps; 12-month annual-prepay minimum), GreatVines/Andavi (most
bev-alc-native; visits and surveys, no activation-task assignment), GoSpotCheck/FORM,
Pepperi, VIP/eoStar (depletion data infrastructure), Encompass (beverage ERP), Provi
(ordering marketplace), Park Street (back-office services), Wiser, Movista/Natural
Insight, Trax/Shelfgram (verify execution, don't assign it), Overproof.

### Lightweight small-CPG

- **Promomash** (~$500/mo vendor-submitted): promotional calendar + settlement +
  lift/ROI — deductions machinery wearing a planning label; no owner-per-deliverable.
- **TrewUp** ($599/mo published, Emerging tier): deductions/depletions actuals on a
  UNFI/KeHE/Kroger natural-channel data spine — wrong tool, wrong channel for wine
  through three-tier.
- Crisp (data pipes), Shelvspace (field-team shaped): no.

### Why the category misses, structurally

1. **Object**: TPM's object is money; retail-execution's is a store visit. The needed
   object is a *deliverable* with an accountable human, a date, and three states.
2. **Actor**: the owners here are marketing coordinators, graphics vendors, distributor
   reps, agencies — not field reps on routes with GPS check-in apps.
3. **Price signal**: near-universal price opacity + annual commitments + multi-month
   implementations = six-figure enterprise sales motion.

If demoing anything from this category, demo **Repsly** and **GreatVines/Andavi** — to
*disprove*, with one question: "can a task attach to a chain promotion rather than a
store, be assigned to a non-field employee, and be filtered to 'no owner assigned'?"

---

## Sources

Vendor pricing/docs pages fetched 2026-08-20. Generic tools: monday.com/pricing and
support.monday.com (subitems, dashboards, plan pricing, templates); asana.com/pricing,
asana.com/features (custom-fields, portfolios, reporting-dashboards), help.asana.com
(universal-reporting, subscription-size); clickup.com/pricing, help.clickup.com
(custom-field types/uses, multiple assignees, dashboards/cards limits);
airtable.com/pricing, support.airtable.com (user-field-type, filtering, interface
designer + permissions, plans overview, automations); smartsheet.com/pricing,
help.smartsheet.com (assigning-people, report builder + source sheets, seat types,
pro-plan limits); notion.com/pricing, notion.com/help (database-properties,
views-filters-sorts, performance, billing), notion.com/releases/2024-06-26.
TPM/bev-alc: govividly.com, telus.com/agcg, promomash.com/plans, trewup.com/plans,
repsly.com/pricing, andavisolutions.com, appexchange.salesforce.com (Accenture CAS
listing), salesforce.com/consumer-goods (403 to automated fetch — edition mapping
unverified), plus Capterra/Software Advice vendor-submitted entries and PR Newswire
acquisition/launch announcements as flagged inline in the full agent reports.

Known verification gaps (flagged by the researchers, not guessed around): Smartsheet's
USD prices rendered garbled (cross-checked via site search — eyeball the live page
before any purchase); Notion Business monthly rate unverified; Monday month-to-month
rates unverified (annual advertised as "SAVE 18%"); "is empty" on people-fields
undocumented everywhere except Smartsheet; ClickUp's dashboard "uses" caps on
Free/Unlimited (60/100) sourced from vendor-hosted threads, not the 403'd help article.
