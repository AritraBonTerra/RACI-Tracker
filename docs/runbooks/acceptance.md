# Acceptance — the 30 scenarios

What "done" means for sign-in and access control, from
[#27](https://github.com/AritraBonTerra/RACI-Tracker/issues/27). Numbering is
that issue's, so a scenario can be argued about in one place.

Most of these are asserted on every push. `bun run test` is the whole automated
half — the public Convex function surface called with an identity injected per
scenario, plus the source-level checks in `checks/` — and the table below names
the test that carries each claim, so a scenario is checked by reading a failing
test name rather than by remembering what was tried. The names are themselves
checked: `checks/acceptance.test.ts` fails if this table cites a test that no
longer exists, and fails again if any one of the thirty rows stops citing
anything at all.

The rest need an identity provider, a browser, and a deployment. Those are
marked **manual** and written out below the table. Run them on a production-like
environment before cutover, and re-run **groups A and D on production
immediately after cutover** — the boundary that matters is production's.

Automated tests are marked ✅ once `bun run test` passes on the release commit;
that is one checkbox for all of them, not twenty-two.

## The table

| # | Scenario | Covered by |
| --- | --- | --- |
| **A** | **Sign-in and the tenant boundary** | |
| 1 | Assigned employee completes the one-button flow and lands per the reach rules | **manual A1**; landing rule: `scopedReads` "a Promotion-only Member lands on their promotion instead of the dashboard" |
| 2 | A personal Microsoft account cannot complete sign-in | **manual A2** |
| 3 | A tenant guest, or a member without the app assignment, is refused | **manual A3** |
| 4 | First sign-in creates an active zero-assignment Member, in the awaiting queue with candidate matches | `access` "creates exactly one active Member with no Access Assignments"; `directory` "a new sign-in lands in the awaiting-access queue and leaves it when granted", "candidate matching offers internal People only, never Distributor or Buyer"; screen: **manual A4** |
| 5 | An anonymous or invalid-token caller gets nothing, on every function | `scopedReads` "an anonymous caller is refused by every public read"; `scopedWrites` "an anonymous caller is refused by every public write"; both files' "a verified token with no User record yet is refused the same way"; `directory` "an anonymous caller is refused every Directory function"; `access` "refuse an anonymous caller at all four doors" |
| **B** | **Scope authorization, each level** | |
| 6 | Promotion-only Member: full task control, KPI and Retro, ancestors as labels, nothing else | `scopedWrites` "a Promotion Member has full task control inside their scope", "a Member writes the KPI entries and the Retro of a covered Promotion"; `scopedReads` "a Promotion-only Member sees their promotion and no sibling, plan or year", "a Promotion-only Member's dashboard has no phase 0 and no plan phases" |
| 7 | Chain Plan Member sees phases 1–4 and every promotion under the plan, including later ones | `scopedReads` "a Chain Plan Member sees the plan and every promotion under it", "records created after a grant are inside it" |
| 8 | Plan Year Member sees phase 0 and everything under the year, inheritance dynamic | `scopedReads` "a Plan Year Member sees phase 0 and everything under the year", "records created after a grant are inside it" |
| 9 | Every hierarchy or reference-data write by a Member is refused server-side | `scopedWrites` "hierarchy, reference-data and People writes are refused for every Member" |
| 10 | Administrator keeps full CRUD and the Administrator-only surfaces; for a Member they are absent | `scopedWrites` "the same writes all succeed for an Administrator"; `scopedReads` "an Administrator still reads the whole tree"; `directory` "a Member is refused every Directory function"; absence in the UI: **manual B10** |
| **C** | **Overlap, revocation, deactivation** | |
| 11 | Overlapping grants are a union; revoking the redundant one changes nothing; revoking the last removes access live | `scopedReads` "an overlapping grant changes nothing, and revoking it changes nothing back", "revoking the broader grant leaves the narrower one standing"; `directory` "overlapping grants are harmless: revoking the redundant one changes nothing"; live update: **manual C11** |
| 12 | Deactivation denies the next call and shows the deactivated screen; reactivation restores role and grants exactly | `directory` "deactivation denies the account's next call and reactivation restores it exactly", "a deactivated Administrator comes back an Administrator"; screen: **manual C12** |
| 13 | After an Entra disable, new sign-ins are refused and a live session dies within the token lifetime | **manual C13** |
| **D** | **Forged identifiers and probing** | |
| 14 | An out-of-scope deep link is indistinguishable from a deleted one | `scopedReads` "an out-of-scope record and a deleted one produce identical responses", "a forged identifier reads exactly like an out-of-scope one", "an Administrator's own dead link answers the same null"; screen: **manual D14** |
| 15 | A mutation at an out-of-scope id fails exactly as one at a nonexistent id | `scopedWrites` "an out-of-scope write fails byte for byte like a write to a deleted record"; `directory` "a forged account id reads exactly as a deleted one does", "a grant aimed at a forged scope fails exactly as one aimed at a deleted scope" |
| 16 | A create pointing at an out-of-scope parent is refused by the loaded parent's ancestry | `scopedWrites` "a create is refused by the loaded parent's ancestry, not by its argument" |
| 17 | No list, search or picker holds an out-of-scope record; the People picker stays whole | `scopedReads` "the plan year list holds only years the viewer can reach", "a signed-in Member with no grants gets reference data and nothing else"; `scopedWrites` "a Member assigns RACI from the whole People directory, other functions included" |
| **E** | **Aggregates** | |
| 18 | A Member's dashboard, tracks and rail equal an Administrator's restricted to their scopes | `scopedReads` "a Member's dashboard equals an Administrator's restricted to their scopes" |
| 19 | A Person's workload counts only in-scope tasks | `scopedReads` "a person's workload counts only the tasks the viewer can see" |
| **F** | **Audit and visibility** | |
| 20 | Every access-management action is audited with actor and timestamp; a Member cannot read audit data | `directory` "every access-management action lands in the feed with an actor and a timestamp", "the feed names the operator behind a deploy-credential action", "a Member is refused every Directory function" |
| 21 | Ordinary edits carry a last-modified-by stamp | `scopedWrites` "an edit records who made it, everywhere the record is shown", "an editor with no name is Someone, never their work address" |
| 22 | A Member sees their own role and scopes and nothing about anyone else's | `directory` "a Member's own role and scopes are all they can read about access" |
| **G** | **Bootstrap, recovery, operations** | |
| 23 | Fresh-deploy drill: sign in → `grantAdmin` → promote the second Administrator in the UI | `cutover` "the bootstrap drill: sign in, grantAdmin, promote the second Administrator"; on production: **manual G23** |
| 24 | The last active Administrator cannot be demoted or deactivated | `directory` "the last active Administrator cannot be demoted or deactivated", "no legal sequence of Directory moves empties the deployment of Administrators"; the disabled button: **manual G24** |
| 25 | Lockout drill: deploy credentials restore an Administrator with the UI unusable | `cutover` "the lockout drill: deploy credentials restore an Administrator with the UI unusable", "break-glass reaches an account that has never signed in only after it does"; on production: **manual G25** |
| 26 | Seed, migrations and break-glass are not callable from any client | `accessBoundary` "the deploy-credential module exposes nothing publicly", "only the access module builds public functions from the raw factories" |
| 27 | Rollback drill: the prior commit runs against this data, and rolling forward loses nothing | `cutover` "records written by the previous deployment still read and still write", "the access tables are additive: the plan data never points at them"; the redeploy itself: **manual G27** |
| 28 | Silent refresh is invisible; a forced reauth shows the session-expired screen and returns you; sign-out lands on the card | **manual G28** |
| **H** | **Regression** | |
| 29 | An Administrator walks the whole demo arc with pre-auth behaviour | `scopedWrites` "the demo arc still runs end to end under an Administrator identity"; by hand: **manual H29** |
| 30 | `seed:run --prod` still produces the canonical data set, derived states unchanged | `cutover` "the seed still produces the canonical data set", "Unassigned, Blocked and Overdue still mean what the demo data says they mean", "the seed is idempotent, so a second run lands on the same deployment" |

- [ ] `bun run typecheck && bun run test` green on the release commit — every
      automated cell above.

## The manual runs

Each one is a browser and a real identity provider. Record the date and who ran
it; a scenario checked on a laptop against a development instance is not
checked.

**A1 — the way in.** Sign in as an app-assigned employee. One button, no email
field, no password field, no other provider. You land on your dashboard, or
straight on your Promotion if that is the only thing you hold.

**A2 — a personal account.** Sign in with an `@outlook.com` account. Microsoft
refuses it before the app renders anything. Nothing appears in
`bootstrap:listUsers --prod`.

**A3 — a guest and an unassigned employee.** Same, for a tenant guest and for a
tenant member you have not assigned in the Entra enterprise application. Both are
refused by Entra, not by app code. Re-assign afterwards if you unassigned
someone real.

**A4 — the waiting room.** A first-time employee sees "You're signed in — access
comes next" and nothing else: no navigation, no data. An Administrator sees them
at the top of the Directory roster with an *Awaiting access* pill and candidate
Person matches.

**B10 — absent, not greyed out.** As a Member, confirm the People, Manage and
Directory entries are missing from the sidebar rather than disabled, and that
typing `#/directory` in the address bar gets you the "doesn't exist, or you don't
have access" screen.

**C11 — revocation is live.** With the Member's tab open on a granted Promotion,
revoke the grant from the Directory. Their tab changes without a reload.

**C12 — deactivation is live.** Same setup: deactivate the account and watch the
tab drop to the deactivated screen on its next call. Reactivate, and everything
they had comes back.

**C13 — the Entra side.** Disable or unassign a test account in Entra. A fresh
sign-in is refused immediately. A session already open survives until its token
expires (about an hour) — which is why the runbook deactivates locally first.

**D14 — a denied link says nothing.** As a Member, open a deep link to a
Promotion you do not hold, then open one to a Promotion that has been deleted.
The two screens are identical, word for word.

**G23 — the bootstrap drill, on production.** Step 4 of `cutover.md`, performed
for real: sign in, `grantAdmin` yourself, promote the second Administrator from
the Directory. Finish with two active Administrators in
`bootstrap:listUsers --prod`.

**G24 — the guard, in the UI.** With one active Administrator, confirm *Make
Member* and *Deactivate account* are disabled on your own row and say why.

**G25 — the lockout drill.** Deactivate the second Administrator from the
Directory, then bring them back with `bootstrap:reactivateUser --prod` — deploy
credentials only, no UI. They return as an Administrator with their grants.

**G27 — the rollback drill.** On a staging deployment, not production: follow
the rollback section of `cutover.md`, confirm the pre-auth app runs against the
data untouched, then redeploy the release and confirm every account and grant is
still there.

**G28 — sessions.** Leave a tab open long enough for a silent refresh and
confirm nothing interrupts you. Force an interactive reauth (sign out of
Microsoft, or clear the Clerk session) and confirm the "session expired" screen
returns you to the page you were reading. Sign out from the avatar menu and land
on the card with "You're signed out."

**H29 — the demo arc by hand.** As an Administrator: dashboard → Plan Year →
Chain Plan → Promotion → assign RACI → set a status, including a Blocked with a
reason → KPI table → Retro → Manage. Everything behaves as it did before
sign-in existed, plus the "Last edited by" stamps.

## Recording a run

Copy the checkboxes into the cutover issue rather than editing this file, so the
document stays the definition and the issue stays the evidence.
