# Cutover — turning sign-in on in production

The release that ends anonymous access. One sequenced cutover, not a flag: a
half-gated boundary is not a boundary, and the only people using the tool today
are the two running the cutover.

Three documents, in order. `docs/runbooks/clerk-setup.md` is the dashboard work
(Clerk, Entra) and has to be finished first. This file is the release itself and
the drills around it. `docs/runbooks/acceptance.md` is the checklist the release
is judged by. `docs/runbooks/access-administration.md` is the day after.

Everything here is a human step. An agent can write the code, the tests and this
page; it cannot reach the Clerk dashboard, the Entra admin centre, Vercel, or a
production deploy credential.

---

## Before the day

- [ ] `bun run typecheck && bun run test` green on the integration branch.
- [ ] Clerk **Pro** production instance promoted, with the SAML enterprise
      connection to the company Entra tenant live, every other sign-in strategy
      off, and SCIM Directory Sync on — `clerk-setup.md` §B, steps 1–6.
- [ ] Entra enterprise application created with **Assignment required = Yes**
      and the pilot group assigned. Anyone not assigned cannot sign in, which is
      the point; make sure both cutover operators are assigned.
- [ ] The two people who will be Administrators are decided, and both can sign
      in with their work account. Two, not one — the system refuses to remove
      the last one, so a single Administrator is a lockout waiting to happen.
- [ ] Whoever runs step 3 holds the Convex production deploy credential and the
      Vercel project. No agent, no shared terminal.
- [ ] The pilot Members' scopes are written down: which Plan Year, Chain Plan or
      Promotion each of them gets. Granting is fast; deciding is not.

### The environment matrix

Six values, four places, none of them in the repo. The tenant id and the SAML
metadata URL never leave the Entra and Clerk dashboards.

| Value | Where it is set | Production | Development |
| --- | --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex deployment (`bunx convex env set … --prod`) | `https://clerk.<company-domain>` | `https://<slug>.clerk.accounts.dev` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Vercel project, per environment | `pk_live_…` | `pk_test_…` in `.env.local` |
| `VITE_CLERK_ENTERPRISE_DOMAIN` | Vercel project, Production only | the company email domain | unset |
| `CONVEX_DEPLOY_KEY` | Vercel project (already set) | production deploy key | — |
| `VITE_CONVEX_URL` | injected by `convex deploy` during the Vercel build | — | written by `bun run convex` |
| SAML metadata URL, tenant id | Entra and Clerk dashboards only | — | — |

Two of these fail in ways worth naming. A missing `CLERK_JWT_ISSUER_DOMAIN`
fails the deploy rather than the app: `convex deploy` refuses to push an auth
config whose variable is unset and says so by name — *"Environment variable
CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not
set"* — which in the Vercel build means a failed build and the previous
deployment still serving. Skipping step 2 therefore cannot produce a half-signed-
in production; it produces a red build. A missing
`VITE_CLERK_ENTERPRISE_DOMAIN` on a `pk_live_` build now renders "Sign-in isn't
configured" and names the variable, rather than offering the development widget
against an instance that refuses it.

---

## The sequence

Roughly thirty minutes, most of it verification.

**1. Merge the integration branch.** `feat/access-signin` into `main`, with the
suite green. `main` auto-deploys, so this step *is* the release: Vercel builds
the frontend and `convex deploy` pushes the matching backend in the same build.

**2. Set the environment variables** — before the merge lands if you can, since
the deploy that follows reads them.

```sh
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<company-domain> --prod
bunx convex env list --prod   # confirm
```

`VITE_CLERK_PUBLISHABLE_KEY` and `VITE_CLERK_ENTERPRISE_DOMAIN` go in the Vercel
project's **Production** environment. Vercel bakes them at build time, so set
them first and redeploy if you did not.

**3. Watch the deploy finish**, then open the app. You should see the sign-in
card: one button, no email field, no password field. The public URL stops
answering anonymous visitors here.

**4. The bootstrap drill.** No authorization gap to bridge — from this moment
every function denies by default, and the first sign-in creates a Member holding
nothing.

```sh
# You sign in through Microsoft first, landing on "access comes next".
bunx convex run bootstrap:listUsers --prod          # find yourself
bunx convex run bootstrap:grantAdmin '{"email":"you@company.com"}' --prod
```

Your open tab becomes an Administrator without a reload. Then the second
Administrator signs in, and you promote them **in the Directory**, not at the
CLI — the CLI is for the case where there is no Administrator to click with.

Confirm two active Administrators before going further:

```sh
bunx convex run bootstrap:listUsers --prod
```

**5. Grant the pilot Members their scopes** from the Directory
(`docs/runbooks/access-administration.md`). Link each account's Person first;
the effective-access preview shows what each grant unlocks before you confirm.

**6. Run `docs/runbooks/acceptance.md`.** Groups A and D are the ones that must
be re-verified here, on production, whatever was checked on a production-like
environment beforehand.

**7. Tell the pilot group.** They sign in with the Microsoft button; nobody has a
password to set.

> **Do not run `seed:run --prod` after step 4.** The seed owns the plan data and
> clears it before reloading, so grants pointing at seeded records disappear
> with them and their Members drop back into the awaiting-access queue. People
> go too, which silently unlinks every account you linked one to in step 5 — the
> Directory shows those accounts as unlinked again, with no warning that it once
> knew better. Accounts, roles and the audit trail survive, but you would be
> redoing step 5 and every grant.

---

## Rollback

The schema change is additive: three new tables, and every column added to an
existing table is optional. The prior commit's *functions* therefore run
unmodified against this data and ignore what they do not know about, and there
is no data step — nothing has to be deleted or back-filled.

**The prior commit's `convex/schema.ts` is the one file you must not roll
back.** Convex validates every stored document against the schema being pushed,
and its object validators reject fields the table does not declare. The pre-auth
schema does not declare `lastModifiedBy` / `lastModifiedAt`, so the moment
anyone has edited a record under the release — one note, one status change —
pushing the pre-auth schema fails validation on that row and the rollback
stalls with production still on the release. Keep this release's schema and
roll back only the code.

**Backend first**, because it is the half that can refuse. If `convex deploy`
fails you have not touched the frontend yet and there is nothing to undo; the
Vercel promote that closes the window takes seconds.

```sh
git checkout <prior-commit>
git checkout <release-commit> -- convex/schema.ts   # keeps the optional columns
bunx convex deploy                                  # backend first; `deploy` means production
```

That pair is checked: the pre-auth `convex/` typechecks against this schema
(the added columns are optional and the three access tables are unreferenced),
and `convex/cutover.test.ts` asserts both directions — that a pre-auth-shaped
table rejects a stamped row, which is why the file is pinned, and that rows
written without the columns still validate under this schema, which is why
rolling forward again is safe.

**Expect a blank page between the two steps.** Both halves of the rollback move
in one direction, so for the minute or so between them the deployed pair does
not match, and neither mismatch renders: this frontend against the pre-auth
backend calls `access.me`, which that backend does not have, and the pre-auth
frontend against this backend has its first query denied for being anonymous.
Both fail closed — nothing leaks either way — but a failed query at the top of
the tree is a white page, not an error screen and not "the old app with a
sign-in screen in front of it". It is the one procedure where the intermediate
state reads exactly like a broken production, so know it is coming and finish
the sequence rather than panicking forward.

Then roll the frontend back in Vercel: **Deployments → the last pre-auth build →
Promote to Production**. A Vercel rollback serves a cached build and does *not*
re-run `convex deploy`, which is exactly why the backend is a separate step.

Rolling forward again loses nothing. The Users, Access Assignments and Audit
events are still there — nothing deletes them — so redeploying the release
restores every account and grant as it was.

---

## Lockout recovery

Break-glass is the bootstrap tooling, and it needs only the Convex production
deploy credential:

```sh
bunx convex run bootstrap:listUsers --prod
bunx convex run bootstrap:grantAdmin '{"email":"someone@company.com"}' --prod
bunx convex run bootstrap:reactivateUser '{"email":"someone@company.com"}' --prod
```

`grantAdmin` reactivates as it promotes, so a deactivation cannot make a lockout
permanent. Neither command can mint an account: only the identity provider does
that, so the target has to have signed in at least once. If nobody has, sign in
yourself and run `grantAdmin` on your own address.

A lost Microsoft credential is Entra's recovery problem. This app never holds a
credential to recover.

Keep **two** active Administrators so this stays a drill.

---

## Offboarding, once you are live

Both sides, local first: *Deactivate account* in the Directory denies their very
next call, then disable or unassign the account in Entra so no new token is ever
issued. With SCIM on, the Entra disable also revokes their Clerk sessions, but it
lands within the token lifetime (about an hour) rather than instantly.

---

## Human-only steps

Every step on this page. Specifically: the Clerk and Entra dashboards, the Vercel
project's environment variables and rollback control, the merge to `main`,
anything run with `--prod`, and the manual half of the acceptance checklist —
the identity-provider handshake, the sign-in and session screens, and the
rollback drill.
