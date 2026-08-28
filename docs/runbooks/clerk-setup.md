# Clerk setup — free tier, email code and Google

Everything sign-in needs that is not code. All of it happens in the Clerk
dashboard, the Google Cloud console, Vercel and the Convex CLI, none of which an
agent can reach — so this file is the written form of those clicks. The repo
half (`convex/auth.config.ts`, `convex/access.ts`, `src/lib/auth.ts`) is already
in place and needs no changes as you work through it.

**Cost: $0.** Clerk's free plan covers 10,000 monthly active users; this
deployment expects 10–25. Nothing here needs an Entra app registration, an IT
ticket, or a paid Clerk plan. See `docs/adr/0003-clerk-free-tier-email-code-and-google.md`
for why the Clerk Pro + SAML design in #30 was dropped.

Two environments, in this order: development first, so the whole flow can be
exercised on a laptop, then production.

Section B is step 1 of the release. `docs/runbooks/cutover.md` is the rest of
it — the order the environment variables, the deploy, the bootstrap and the
acceptance run happen in, and how to roll any of it back.

---

## What the boundary actually is

Worth reading before the clicks, because it changed.

Sign-in **no longer refuses anybody**. An email verification code reaches any
inbox; "Continue with Google" accepts any Google account. Three things stand
between a stranger and this company's promotion calendar, and none of them is
the sign-in screen:

1. **Deny by default.** A first sign-in creates a Member with *zero* Access
   Assignments. They see one screen — "You're signed in, access comes next" —
   and no query returns them a record of any kind. Every function resolves
   identity server-side; the UI is never the boundary.
2. **`ALLOWED_EMAIL_DOMAIN`** (section C). Set it on the Convex deployment and
   only *verified* addresses at that domain may hold an account at all. Anyone
   else is refused before a User row exists, with the same opaque sentence every
   other refusal uses.
3. **Control of the corporate mailbox.** The code goes to
   `someone@<company-domain>`, and that mailbox sits behind the company's own
   Microsoft sign-in and MFA. Whoever cannot open the mailbox cannot receive the
   code.

What that costs, stated plainly:

- A personal account can now *reach* the awaiting-access screen instead of being
  turned away by the identity provider.
- An attacker who has already compromised an employee's mailbox no longer has to
  also defeat MFA at a Microsoft prompt — the mailbox *is* the factor rather than
  sitting behind one.
- **With the gate unset, a stranger who signs in can read the People
  directory.** Names and functions, so RACI pickers resolve for every account
  (story 18, scenario 17) — no plan year, chain, promotion, task or KPI. It is
  the one thing on the other side of a sign-in that a zero-access Member can
  see, and it is the concrete reason to set `ALLOWED_EMAIL_DOMAIN` in
  production.

That is the deliberate trade in ADR 0003.

**The upgrade path is still there.** If IT ever grants an Entra app
registration, adding a SAML enterprise connection on a Clerk Pro instance
restores the structural tenant boundary without touching the access model or
the schema: `convex/access.ts` already reads the `entra_*` claims, and the
identity key is the Clerk user id either way.

---

## A. Development instance (do this first)

1. **Create the Clerk application.** `bunx clerk@latest init` from the repo
   root, or create it at [dashboard.clerk.com](https://dashboard.clerk.com) on
   the **Free** plan. One application, two instances (development and
   production) — that is Clerk's own model, not two applications.
2. **Sign-in strategies.** *User & Authentication → Email, Phone, Username*:
   - **Email address**: on, as a required identifier.
   - **Email verification code**: on.
   - **Password**: off. **Email link**: off. There is no local password
     anywhere in this system and there should be nothing to phish.
   - *SSO connections → Google*: on. A development instance uses Clerk's shared
     OAuth credentials, so it needs nothing from Google Cloud.
3. **Allow sign-ups.** *Restrictions → Sign-up mode: Public.* The sign-in card
   runs Clerk's combined sign-in-or-up flow (`<SignIn withSignUp />`), so a
   first-time employee's address has to be allowed to create a Clerk user.
   Admission to *this app* is decided afterwards, by section C and by an
   Administrator's grant — not here.
4. **Turn on the Convex integration.** *Integrations → Convex*. This maps
   `aud: "convex"` into the default session token, which is what
   `convex/auth.config.ts` expects. Do **not** create a `convex` JWT template —
   the template path is legacy, and claims placed there are silently dropped by
   recent Convex clients.
5. **Add the three claims.** *Sessions → Customize session token*:

   ```json
   {
     "email": "{{user.primary_email_address}}",
     "name": "{{user.full_name}}",
     "email_verified": "{{user.primary_email_address_verified}}"
   }
   ```

   All three are required, and none is in Clerk's default token.

   - Without `email`, `identity.email` is undefined, every User is created with
     no email, and `bootstrap:grantAdmin --email` is unusable.
   - Without `name`, `users.displayName` is never set and every last-edited
     stamp in the app reads "Last edited by Someone" — the fallback exists for
     tokens that genuinely carry no name, not as the normal case.
   - Without `email_verified`, `ALLOWED_EMAIL_DOMAIN` refuses **everyone**: an
     unverified address is not a domain membership, so the gate fails closed.
     Leave the gate unset and this claim does not matter; set the gate without
     this claim and nobody can sign in. Map it now.
6. **Copy the two values** from *API keys* and *Domains*:

   - Publishable key (`pk_test_…`) → `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`
   - Frontend API URL (`https://<slug>.clerk.accounts.dev`) → the Convex dev
     deployment:

     ```sh
     bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<slug>.clerk.accounts.dev
     ```

7. **Run it.** `bun run convex` and `bun run dev` in two terminals, open the
   app, sign in with an email code, then sign out and sign in again with Google.
   Both land on "You're signed in — access comes next".
8. **Become an Administrator.**

   ```sh
   bunx convex run bootstrap:listUsers
   bunx convex run bootstrap:grantAdmin '{"email":"you@example.com"}'
   ```

   The screen changes without a reload — Convex reactivity carries the role
   change to the open client.

---

## B. Production instance

Still the free plan. Two things differ from development, and one of them is a
prerequisite worth checking before you start.

### B0. A domain you control

**A Clerk production instance requires DNS records** on a domain you own —
Clerk asks for CNAMEs under `clerk.<your-domain>`. A `*.vercel.app` hostname
cannot carry them, so `raci-tracker-rose.vercel.app` alone is not enough.

Two honest options:

- **Point a domain at the Vercel project** (any domain you control, including a
  subdomain of one you already own), add it in Vercel, and then promote the
  Clerk instance against it. This is the one that ends in a real production
  setup.
- **Run the pilot on the development instance.** Clerk development instances
  work on any origin, cost nothing, and carry `pk_test_` keys. Everything in
  this repo works against one. The trade: a development instance is capped at a
  small user count, its sessions are development-grade, and Clerk shows a
  development banner — fine for a pilot with a handful of employees, not a
  place to leave real commercial data indefinitely.

Decide this before section B; the rest of it assumes you took the first option.

### B1. Promote and configure

1. **Promote the instance** — *Production* in the Clerk dashboard, or
   `bunx clerk deploy`. Register the app domain and add the DNS records Clerk
   asks for. Wait for them to verify.
2. **Repeat A2–A5 on the production instance.** Sign-in strategies, sign-up
   mode, the Convex integration, and all three session-token claims are
   per-instance settings and do **not** carry over from development. The
   `email_verified` claim especially: production is where the domain gate runs.
3. **Create a Google OAuth client** — production instances do not get Clerk's
   shared credentials, so "Continue with Google" is dead until you do. Free, no
   IT involvement, about five minutes at
   [console.cloud.google.com](https://console.cloud.google.com):

   - Create a project (any name).
   - *APIs & Services → OAuth consent screen*: **External**, app name, your
     support and developer email. Publish it, or leave it in Testing and add
     each pilot user as a test user — Testing caps at 100 users and shows an
     "unverified app" interstitial.
   - *Credentials → Create credentials → OAuth client ID → Web application*.
   - **Authorized redirect URI**: the exact callback URL Clerk shows on
     *SSO connections → Google* on the production instance
     (`https://clerk.<your-domain>/v1/oauth_callback`). Copy it from Clerk
     rather than typing it.
   - Back in Clerk's Google connection, switch it to **custom credentials** and
     paste the **Client ID** and **Client secret**.

   The email-code strategy needs none of this. If Google is more trouble than
   it is worth on the day, ship with email code alone and add Google later —
   nothing in the app depends on it.
4. **Set the production environment variables.**

   ```sh
   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain> --prod
   ```

   In the Vercel project, for the **Production** environment:

   - `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`

   That is the only frontend sign-in variable. Vercel bakes it at build time, so
   set it before the deploy that follows the merge. A build without it renders
   "Sign-in isn't configured" naming the variable, rather than a white screen.

---

## C. The email-domain gate

One optional Convex environment variable, per deployment:

```sh
bunx convex env set ALLOWED_EMAIL_DOMAIN vctusa.com --prod
bunx convex env list --prod          # confirm
bunx convex env remove ALLOWED_EMAIL_DOMAIN --prod   # turn it back off
```

**Set**: only a *verified* address ending in `@vctusa.com` may create or keep a
User. Everyone else is refused — at first sign-in and on every call after it —
with the one sentence every refusal in this app uses. The value is normalised,
so `@VCTUSA.com` with a stray space means the same thing, and the match is on
`@<domain>` so `notvctusa.com` and `vctusa.com.attacker.net` are both outside.

**Unset**: the gate is off. Any verified sign-in becomes a zero-access Member
in the awaiting-access queue and stays there until an Administrator grants
something.

Three things to know before you set it:

- **It takes effect immediately, including backwards.** The gate is re-read on
  every call, so turning it on locks out an account that was admitted while it
  was off — the very next call from that account is refused. That is deliberate,
  and it means the variable is also the fastest way to expel a wrong sign-in.
  Do not set it to the wrong domain and then go to lunch.
- **It needs the `email_verified` claim** (A5). Without that claim mapped on the
  instance, the gate refuses everyone, including you.
- **It mostly turns Google off.** "Continue with Google" only passes the gate if
  the employee's Google account carries their `@vctusa.com` address, which at a
  Microsoft shop it usually will not. With the gate set, expect email code to be
  the real path in and Google to be a convenience for whoever happens to have a
  work-address Google account. That is fine — email code is the strategy the
  boundary is built on.

Leave it unset for the pilot if you would rather not lock anyone out on day one;
deny-by-default still means a stranger who signs in sees nothing at all.

---

## Verify before trusting it

- The card offers an email field and a "Continue with Google" button, and no
  password field.
- A first sign-in with a work address lands on "access comes next" and appears
  in `bunx convex run bootstrap:listUsers --prod`.
- Google sign-in completes and returns you to the page you started from.
- Sign out returns to the card with "You're signed out."
- `bunx convex run bootstrap:grantAdmin '{"email":"…"}' --prod` promotes, and
  the open client changes without a reload.
- If `ALLOWED_EMAIL_DOMAIN` is set: a personal address gets "This account can't
  be used here" and creates no account —
  `bunx convex run bootstrap:listUsers --prod` never shows it.

## Granting access

Day to day this happens in the **Directory** — `#/directory`, Administrators
only. `docs/runbooks/access-administration.md` is that surface.

The CLI equivalents stay for bootstrap and break-glass, when there is no
Administrator to click with:

```sh
bunx convex run bootstrap:listUsers --prod
bunx convex run bootstrap:grantAccess \
  '{"email":"them@company.com","scope":{"tier":"chainPlan","chainPlanId":"<id>"}}' --prod
bunx convex run bootstrap:revokeAccess \
  '{"email":"them@company.com","scope":{"tier":"chainPlan","chainPlanId":"<id>"}}' --prod
```

`tier` is `season` (the Plan Year), `chainPlan`, or `promotion`, with the
matching `seasonId` / `chainPlanId` / `promotionId` beside it — take the id
straight out of the URL of the page you want them to have. Both calls run the
same model the Directory's buttons do, so the semantics are identical and both
write an Audit event; only the actor differs, and the feed shows CLI actions as
"Deploy credentials".

## What a Member can and cannot do

Finishing this runbook gets you sign-in, **scoped reads** and **scoped writes**.
Every public query and every public mutation resolves the caller's identity
server-side; nothing outside `convex/access.ts` builds a function from a raw
factory, and `convex/accessBoundary.test.ts` fails the build if anything does.

Inside a granted scope a Member has full control of the work:

- create, edit, reorder and delete tasks; set specs, quantities and ETAs
- change status, with a reason still required to mark anything Blocked
- assign and change RACI, choosing from the **whole** People directory — the
  right owner often sits in another function
- edit the fields of the records their scope covers: a Promotion's name, dates,
  stores, brands and notes; a Chain Plan's phase, JBP date and notes; a Plan
  Year's label and notes
- write the KPI entries and the Retro of a Promotion they hold

Reserved to Administrators, and refused server-side for everyone else:

- creating and deleting Plan Years, Chains, Chain Plans, Promotions and Brands
- every write to the People directory, including renaming a Function
- the Task Template menu in Manage

Two properties are worth knowing when you read a failure:

- **A refused write says nothing.** A mutation aimed at a record outside the
  caller's scope fails with the identical sentence a deleted record produces, so
  no sequence of writes can map what exists.
- **A create is judged by its parent.** The id in the argument is a lookup key,
  never a claim: the parent is loaded and *its* stored ancestry decides.

Every ordinary edit stamps who made it and when, shown as "Last edited by …"
on the Plan Year, Chain Plan and Promotion pages, on each expanded task row, and
under the KPI table and the Retro. Reference data on Manage is stamped too but
does not display it: only Administrators can edit those rows. The stamp names a
User's display name and nothing else — no email, no role, no scope — and a User
whose token carried no name claim reads as "Someone".

That stamp is not the audit trail — access changes (roles, grants, revocations,
activations, Person links) are Audit events, kept indefinitely, and readable in
the Directory's activity feed.

A Member can see their own role and scopes in the account menu, and nothing at
all about anyone else's: every Directory function refuses them server-side.

## Offboarding

Two steps, and the first one is the one that bites immediately:

1. **Deactivate the account in the Directory.** Their very next call is denied
   and their open tab drops to the deactivated screen. This is the kill switch.
2. **Remove them from the Clerk instance** (*Users →* their row *→ Delete*), so
   no new session can be minted. Without SCIM there is nothing automatic about
   this — it is a click a human makes.

If `ALLOWED_EMAIL_DOMAIN` is set and IT has already disabled the employee's
mailbox, they cannot receive a code either; that is a third, slower gate, not a
substitute for step 1.

## Break-glass

If every Administrator is locked out, whoever holds the Convex deploy
credentials runs:

```sh
bunx convex run bootstrap:listUsers --prod
bunx convex run bootstrap:grantAdmin '{"email":"someone@company.com"}' --prod
```

`grantAdmin` reactivates as it promotes, so a deactivation cannot make the
lockout permanent. Keep **two** active Administrators so this stays a drill.

If the lockout is the domain gate — you set `ALLOWED_EMAIL_DOMAIN` to the wrong
value and refused yourself — the fix is the same credential:

```sh
bunx convex env remove ALLOWED_EMAIL_DOMAIN --prod
```
