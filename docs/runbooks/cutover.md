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
makes every call anonymous, and the backend denies anonymous callers — the app
fails closed, showing an empty shell rather than leaking anything. A missing
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
> with them and their Members drop back into the awaiting-access queue. Accounts,
> roles and the audit trail survive it, but you would be re-granting everything.

---

## Rollback

The schema change is additive: three new tables, and every column added to an
existing table is optional. The prior commit runs unmodified against this data
and ignores what it does not know about, so rollback is a redeploy and there is
no data step.

**Order matters, and it is backend first.** The pre-auth frontend against this
backend is an app where every call is denied; this frontend against the pre-auth
backend is the pre-auth app with a sign-in screen in front of it. The second is
survivable, so pass through it.

```sh
git checkout <prior-commit>
bunx convex deploy            # backend first; `deploy` means production
```

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
