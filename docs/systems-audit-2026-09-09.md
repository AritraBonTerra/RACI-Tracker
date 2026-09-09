RACI Tracker systems audit, September 9, 2026

The app has a credible foundation for an internal team pilot. Its strongest system is authorization. Its weakest areas are release enforcement, recovery, and detecting problems once real people depend on it. Keep the current architecture and close those gaps before expanding the audience.

This audit covers the current worktree at commit `53e4b98`, backend functions, schema, frontend data handling, tests, deployment scripts, runbooks, and read-only GitHub configuration. An existing change in `src/components/TaskRow.tsx` was left untouched. Production Clerk, Convex, and Vercel settings, browser acceptance runs, actual data volume, backups, and runtime latency were not verified. This is a source and configuration audit, not a live penetration test or a capacity certification.

User-confirmed audience: 10–20 people in the pilot, with approximately 100 users maximum at full rollout. Whether everyone belongs to the same organization is still unconfirmed; the rollout plan assumes internal use for now. These are audience targets, not measured capacity limits. Independent organizations need a different isolation decision before onboarding.

User-approved permission direction, recorded after the audit: pilot participants need to edit the work they can see. Keep Administrator access for managing all work, accounts, and permissions. Use Editor as the product name for the current Member capability, preserving its existing limits on hierarchy and reference-data management. Add Viewer access before onboarding the first participant who only needs oversight. Viewers may read all work details within their assigned scope, including tasks, owners, dates, notes, and KPIs, but may not edit, assign, or delete work. Account administration and security audit logs remain Administrator-only. Access continues to flow down from Plan Year, Chain Plan, or Promotion grants; RACI assignments grant no access. Implementation follow-up: this direction is now implemented in the local worktree, including backend write enforcement, read-only screens, Directory role management, domain documentation, and regression tests. It has not been deployed; live acceptance remains pending. The findings below describe the original audit snapshot.

At this audience size, prioritize reliable saves, recovery, permissions, and support over introducing new infrastructure. Total registered users do not establish concurrent load. Test a shared planning meeting with all 20 pilot users active, then a 100-session scenario as headroom for full rollout. Combine those scenarios with realistic multi-year task data; record latency, failed saves, and backend reads before deciding whether additional optimization is needed.

**What is working well**

| System | Evidence | Why it matters |
| --- | --- | --- |
| Server authorization | `convex/access.ts` centralizes active-user checks, Administrator checks, and hierarchical scope resolution. Public functions use its wrappers. | A hidden button is not the permission check. Calling the backend directly still requires authorization. |
| Scoped visibility | `scopedReads.test.ts` and `scopedWrites.test.ts` exercise full access, ancestor labels, hidden records, and denied writes. | Members receive totals based on work they can see. A promotion grant does not disclose sibling promotions. |
| Account lifecycle | Directory and bootstrap share the access model; last-Administrator protection, deactivation, and access audit events are implemented. | You have a practical way to onboard, revoke access, and recover an administrator account. |
| Domain structure | Plan Year → Chain Plan → Promotion is explicit; Person and User are separate; phases and status are constrained. | Naming a person on a task does not accidentally grant them access. External contacts can be recorded without creating accounts. |
| Mutation design | Status changes enforce a blocked reason. RACI list changes use `setMembership`, which reads current state on the server. | Basic business rules survive direct calls, and adding two different people does not replace the entire assignment list from a stale browser snapshot. |
| Derived data | Overdue state, progress, phase windows, and KPI uplift are calculated rather than stored as competing values. | Fewer counters and flags can drift away from the underlying work. |
| Tests and documentation | 155 tests pass. Runbooks cover access, cutover, offboarding, and manual acceptance. | There is an existing base for release verification and operating the app. |

The authorization module has a useful interface: callers ask whether a loaded record is readable or writable, while identity and ancestry logic stay inside the module. Keep that property as features are added. There is no evidence here that a backend rewrite or additional infrastructure would help the pilot.

**Address these before using the app as the team's working record**

1. **Make admission explicit in production. High priority, conditional exposure.**

   `convex/access.ts:79` treats an unset `ALLOWED_EMAIL_DOMAIN` as an open admission policy. `convex/people.ts:29` returns People and their function to any active signed-in account, including a new Member with no grants. That response includes names, titles, email addresses, and organizations when populated. The waiting-room UI does not prevent these backend reads. This is documented behavior, not a newly discovered permission bypass.

   Verify the production domain gate and test an outsider account against the backend. Prefer a production startup/deployment requirement for an explicit admission policy, with any open development mode deliberately configured. Decide whether unapproved users need any reference data. A reduced picker response or approval requirement can reduce exposure without changing plan-level scopes. Do not assume the production gate is missing; its setting was not inspected.

   Completion evidence: a real employee can sign in, an outsider cannot read reference or plan data, and a new employee receives only the access intended before approval.

2. **Turn passing checks into an enforced release prerequisite. High priority, verified configuration gap.**

   GitHub returned `Branch not protected` for `main` and an empty repository ruleset list. The current `check` run is successful, but that does not prevent a later unverified push. `.github/workflows/check.yml` runs lint, TypeScript, and tests; it does not run the Vite production build. `scripts/vercel-build.sh` builds and deploys without invoking the test suite.

   Require pull requests and a successful check for `main`, include the production build, and make the actual production deployment depend on successful verification. Pin the Bun version used for releases instead of `latest`. Review who can bypass the rule.

   Previews currently build only the frontend against a configured dev backend. A branch changing a Convex function is therefore not automatically tested against its matching backend. Start with a stable staging environment containing both halves of the same commit. Isolated branch backends can follow. Convex documents [preview deployments with separate backends and data](https://docs.convex.dev/production/hosting/vercel).

   One documentation correction: the script comment says backend first, then frontend build. The installed Convex CLI and current vendor documentation run the `--cmd` build before pushing functions. The remaining risk is the interval between backend deployment and frontend promotion, plus older browser tabs. Keep backend changes compatible with the previous frontend during that interval.

3. **Provide a tested way to recover data and stop access. High priority.**

   `convex/tasks.ts:216` permanently deletes a task. `convex/promotions.ts:182` deletes a promotion with its tasks and measurement rows. Ordinary edits have a last-modified stamp, not history. `convex/seed.ts:124` and `:135` expose internal clear/reseed operations with no environment guard. They require privileged access, but a mistaken operational command can still clear real work and invalidate grants and Person links.

   Establish a backup schedule, retention policy, recovery owner, and a restore drill into a separate environment. Protect demo reset operations in production, and add non-destructive initialization of reference data so setup does not require wiping the planning tables. For interactive mistakes, provide task undo or recoverable deletion before relying on the app as the only copy of work. A whole-database restore is a poor substitute for undoing one person's deletion while others keep working.

   `docs/runbooks/cutover.md` explicitly rolls back to a backend with no authentication. It also suggests pausing Vercel for a suspected leak. Stopping frontend hosting alone does not stop direct requests to the Convex backend. Replace the emergency procedure with a tested backend containment step and an authenticated known-good release. Keep code rollback and data restoration as separate procedures.

   Convex [backups](https://docs.convex.dev/database/backup-restore) cover table data and optionally files, but not code, environment variables, or pending scheduled functions. Record how to restore those separately. Confirm backup capabilities for the actual account rather than assuming a schedule already exists.

   Proposed starting recovery objectives: no more than one working day of lost data and restoration within four working hours. The team must accept or tighten these targets before launch; neither has been demonstrated.

4. **Preserve failed edits and make failures visible. High priority.**

   `src/components/inline.tsx:42` clears the draft before invoking a save callback whose interface returns `void`. A rejected mutation produces a toast through `useReportedMutation`, but the editor has already discarded the typed draft. This is a source-confirmed failure path, not a browser reproduction.

   Let editors await a save result, show pending/saved/failed state, and retain the draft after rejection. Add a connection indication when edits are waiting for the backend. Test connection loss and permission revocation during an edit.

   `ViewBoundary` covers the routed view, but queries in `App`, navigation, and `AuthGate` sit outside it. Add recovery handling around startup and shell failures. `AuthGate.tsx:127` also exhausts retries silently; an unregistered user can remain on a pending screen. Give that state a retry and support path.

   The current view boundary logs to `console.warn`; no application error-reporting integration was found. Capture unexpected frontend errors and failed critical flows with a release identifier, and establish an owner who checks backend errors and usage. Avoid collecting task notes or contact details in diagnostic events. Provider-side monitoring may exist, but was not inspected.

5. **Close the demonstrated data-validation gaps. Medium priority, reproduced locally.**

   Three temporary tests called the public Convex mutation interface and read back the stored records:

   | Reproduction | Current result | Required behavior |
   | --- | --- | --- |
   | Create and delete an otherwise unused Person, then pass its ID to `tasks.update.accountablePersonId` | The deleted person's ID is stored | Reject a non-null Accountable ID unless its Person exists |
   | Call `chainPlans.update` with `jbpDate: "not-a-date"` | The malformed value is stored | Use the existing calendar-day validator for create and update |
   | Call `promotions.update` with `storeCount: -2.5` | The negative fractional count is stored | Accept only finite nonnegative integers, or an explicit empty value |

   See `convex/tasks.ts:102`, `convex/chainPlans.ts:95` and `:136`, and `convex/promotions.ts:101` and `:144`. The probes confirmed all three behaviors and were removed afterward. No application fixes were made. Use these scenarios as regression tests when implementing the fixes.

6. **Refresh the business date in long-running tabs. Medium priority.**

   `src/App.tsx:36` freezes `today` with `useState(todayIso)`, explicitly for demo consistency. A tab left open overnight continues to classify deadlines using yesterday. Refresh on day changes and when a tab becomes active. Decide whether a shared company timezone or each user's local date defines overdue. Test midnight and a sleeping laptop returning the next day.

7. **Finish the live acceptance runs and establish the feedback loop. High priority for learning from the pilot.**

   GitHub issues [#35](https://github.com/AritraBonTerra/RACI-Tracker/issues/35), [#36](https://github.com/AritraBonTerra/RACI-Tracker/issues/36), and [#37](https://github.com/AritraBonTerra/RACI-Tracker/issues/37) remain open for human setup and acceptance. An open ticket is not proof the work has never happened, but there is no completed production acceptance evidence from this audit. Record the deployment, date, and tester for the existing checklist, especially sign-in, token refresh, denied deep links, two-browser revocation, and lockout recovery.

   Give the pilot group one feedback entry point, an accountable responder, and a weekly review. Record the current page and release with reports. Distinguish bugs, unclear workflow, missing data, and feature requests. A feedback form alone is not a feedback process.

**Improve these before expanding usage**

| Priority | Finding | Next action |
| --- | --- | --- |
| First | People directory and workload queries read all tasks before filtering by access. Directory load calculations scan the visible task list for each person. | Introduce indexed, scoped task retrieval and bounded results. Consider a task-to-person assignment table if person-based queries become frequent. |
| First | Dashboard and navigation independently load promotions and task collections to calculate rollups. | Measure reads, payload sizes, subscription reruns, and latency on realistic multi-year data. Use summaries or incremental aggregates only where measurements justify them. Preserve exact permission-scoped totals. |
| First | A shared field can be overwritten by another user's later edit. Server transactions do not reveal that an editor started from old content. | Add revision checks or conflict handling for notes and retros, with a clear choice to reload or keep a draft. Keep simple idempotent commands for assignment changes. |
| Next | Access events are retained, but the audit interface returns at most 200 entries. | Complete existing [issue #41](https://github.com/AritraBonTerra/RACI-Tracker/issues/41). Add cursor pagination and useful filters. |
| Next | A last-modified stamp cannot explain earlier changes to ETA, owner, status, or KPI values. | Add content history for consequential fields, including before/after values and the actor. Reuse it for user-visible history and selective undo. |
| Next | Migration and reset code operates on entire tables in one invocation. | Make growing-data migrations resumable and batched; validate before/after counts and references. |
| Approved direction | Every in-scope Member can edit and delete tasks; there is currently no read-only role. Account deactivation does not reassign that Person's work. | Pilot participants will use Editor capabilities. Add scoped Viewer access with full work details before onboarding oversight-only participants, following the approved direction above. Add offboarding handover separately. |

The full-task scans are a growth risk, not evidence that the app is slow today. Convex specifically recommends [bounding collections and using indexed queries or pagination](https://docs.convex.dev/understanding/best-practices/). Test at the expected expansion dataset and at roughly ten times that volume. Include multiple years, overlapping grants, large checklists, and concurrent edits. Measure actual reads and updates, not only initial rendering speed.

Keep the existing authorization interface, and put indexed task retrieval behind a shared module so each new dashboard does not implement its own filtering. Do not extract every helper into a separate abstraction. Centralizing a repeated rule is useful; moving a single pass-through call is not.

**New features ranked by what they would contribute**

| Order | Feature | Value and scope |
| --- | --- | --- |
| Pilot | Feedback attached to the current page | Captures what the person was doing and which release they saw. Add report status and follow-up ownership. Keep reports private to the relevant team. |
| Pilot | My work landing page | Reuse the existing Person workload and optional User–Person link to show tasks the signed-in person owns, due soon, blocked, or unassigned within their access. Handle unlinked accounts explicitly. The People workload view already exists; this is a personal entry point. |
| After initial feedback | Digest and blocked-work reminders | Bring people back for a reason. Prefer a configurable digest and a few actionable alerts. Recheck recipient access when sending, deduplicate delivery, support preferences, and define who receives alerts when a Responsible Person has no login. |
| After initial feedback | Activity history and recovery | Show who changed the due date, owner, status, or measurement, and allow appropriate undo. This supports both trust and incident diagnosis. |
| After initial feedback | Offboarding handover | Show an outgoing person's open responsibilities, propose replacement owners, preview the changes, and transfer work without rewriting past history. |
| Expansion | Archive and repeat a prior plan | Close completed years and reuse selected structure, tasks, and retro recommendations. Reset completion, dates, and assignments deliberately. Do not copy user access implicitly. |
| Expansion | Import/export with a validation preview | Reduce the effort of bringing real planning data in and sharing reports. Define duplicate detection, row errors, and permission-scoped exports before adding bulk writes. |
| Demand-led | Approvals, evidence attachments, and integrations | Add an accountable-owner review or execution evidence when users can name the handoff it improves. Scope file access like task access. Integrate the data source causing the most repeat entry after observing the pilot. |

RACI assignment and permission must remain separate in all of these features. An email address in the People table is not authorization to send that person promotion details. Notifications and exports need the same access discipline as the current read functions.

Expansion within the same company can retain the present model. Expansion to independent organizations cannot safely be modeled only by adding more Plan Year grants: People, Brands, Functions, templates, and Administrator reach are currently global. Choose either separate deployments per organization or explicit organization-scoped storage and authorization, then test isolation on every read, write, report, attachment, and notification. Decide this when the audience is known, before accepting a second organization's data.

**A practical rollout sequence**

| Stage | Work | Evidence to move forward |
| --- | --- | --- |
| Preparation | Close launch findings; choose support and recovery owners; prepare staging and representative data; complete live acceptance | Verified admission policy, enforced release checks, two usable Administrators, successful restore drill, and save-failure recovery |
| Internal pilot, proposed two weeks | 10–20 people from planning, execution, and oversight use real work; observe their first session; review feedback weekly | People can sign in, find their work, update it, and understand ownership with little help; problems have owners |
| Pilot improvements | Fix repeated blockers; implement the most useful feedback feature; test expansion-sized data | No unresolved access leak or lost-work incident; recovery remains tested; critical flows work on the devices actually used |
| Wider internal cohort | Expand to about 50 first, then up to the confirmed maximum of about 100; continue measurement and add digests or handover if evidence supports them | Stable completion and save success, acceptable support load, query cost and latency within an agreed budget |

Suggested decision signals, to be agreed before the pilot: at least 80% of participants complete their first useful task update with no more than brief onboarding; at least 70% of people with assigned work return in the second week; no unresolved unauthorized access or lost-work incidents; and the slowest common pages meet an agreed latency target under expansion-sized data. These are proposed pilot criteria, not current measurements or universal industry benchmarks. For small cohorts, keep the actual counts alongside percentages.

Track onboarding time, failed saves, blocked tasks without an owner, repeated support questions, and time from a report to a response. Favor workflow completion over raw page views. Sample direct observation and short interviews as well as telemetry, since infrequent planning work may not produce daily visits.

Validation performed: `bun run check` passed with 155 tests across 13 files and 41 non-blocking lint warnings; `bun run build` passed; three additional isolated mutation probes confirmed the validation gaps above. GitHub's current main-commit check and Vercel status were successful. No deployment, production mutation, GitHub configuration change, or outbound message was performed.

The recommended next implementation batch is admission verification, release enforcement, recovery and reset protection, reliable save/error handling, the three validation fixes, and date refresh. Add pilot feedback at the same time. Use the pilot to choose the next workflow feature; use measured data growth to choose the next performance change.
