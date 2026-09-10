# Eight-phase workflow

The activity list approved on 2026-09-10 has 62 default tasks:

| Phase | Activity | Tasks | Responsible function |
| --- | --- | --- | --- |
| 0 | Company Strategic Foundation | 8 | Marketing |
| 1 | Strat Acc - Internal Alignment | 8 | Sales |
| 2 | Strat Acc - Distributor Alignment | 8 | Sales |
| 3 | JBP Cycle, including agreement | 12 | Sales |
| 4 | Activation - Planning | 7 | Customer Marketing |
| 5 | Activation - Retail Execution | 7 | Customer Marketing |
| 6 | Activation - Tracking & Measurement | 6 | Finance |
| 7 | Overall Review & Optimization | 6 | Sales |

Plan Years carry phase 0, Chain Plans carry phases 1–3, and Promotions carry
phases 4–7. KPI tables are in phase 6 and retros are in phase 7. The source's
"Phase 8 review" reference has been corrected to "Phase 7 review".

Department responsibility is guidance in each template's spec, with matching
Responsible defaults in the phase RACI matrix. Sales maps to the existing
Commercial Strat Account function; Customer Marketing maps to Retail Marketing /
Local Sales. A task still needs a named Responsible person to count as assigned.

## Existing deployment upgrade

Local and staging have been migrated. Production must be migrated before
releasing the new schema to `main`. Do not merge directly into production first.

1. Export a snapshot of the target deployment.
2. Deploy backend commit `8f727c4` using that deployment's explicit credential
   file. It adds the migration while still accepting the old nine-phase data.
3. Run `bunx convex run migrations:eightPhaseWorkflow --env-file <target-env-file>`.
4. Deploy the final eight-phase backend and frontend together.
5. Replace only `taskTemplates` with the approved 62-task menu, and update the
   phase RACI matrix's Responsible functions to the table above. Do not reseed
   the database, which would replace existing work.

The migration combines old phases 3 and 4 into phase 3, and changes old phases
5–8 to 4–7. It preserves IDs, owners, statuses, dates, notes, RACI people, KPI
values and retros. Checklist order is rebuilt within each owner and phase.
A persistent migration record makes repeat runs harmless. Fresh demo seeds are
marked as already using eight phases.

Template replacement affects only newly created work. Existing checklists keep
their tasks, with migrated phase numbers.
