# 3. Clerk free tier with email code and Google, and an app-side employee gate

Date: 2026-08-28

## Status

Accepted. Supersedes [ADR 0002](0002-clerk-saml-for-single-tenant-microsoft-sign-in.md).

## Context

ADR 0002 chose Clerk Pro with a SAML enterprise connection to the company's
Entra tenant, because it is the one Clerk path that structurally refuses
personal Microsoft accounts. The code for it shipped on `feat/access-signin`.
It was never provisioned, and two facts turned up before it could be:

- **$25/mo.** Rejected. This is a pilot for 10–25 people at a company that has
  not yet decided the tool is permanent, and $300/year for a sign-in button is
  not a cost anyone here wants to defend.
- **No Entra portal access.** The SAML connection needs an Entra enterprise
  application, which needs an app registration, which needs rights nobody on
  this project has. IT has not been engaged and engaging them is not a
  three-day errand. A design that cannot be provisioned is not a design.

Everything ADR 0002 says about the alternatives still holds: Clerk's Microsoft
social connection and EASIE support "only the `common` tenant type", so they
degrade the boundary from a tenant to an email domain. The question is no longer
which option keeps the structural boundary — none of the reachable ones do — but
where the boundary goes instead.

The rest of the system already answered that. The access model built for #30
denies by default: a first sign-in creates a Member with zero Access
Assignments, every function resolves identity server-side, and nothing is
readable until an Administrator grants a scope. The identity provider was never
carrying the authorization; it was carrying the *employee* question.

## Decision

**Clerk's free plan, with two strategies: email verification code, and Google.**
$0, 10,000 monthly active users. The employee question moves into the app.

- **One sign-in surface, both environments.** Clerk's prebuilt `<SignIn>` with
  `withSignUp`, rendered inside the app's own frame. The custom
  `authenticateWithRedirect` flow and the `VITE_CLERK_ENTERPRISE_DOMAIN` /
  `signInMode` development-versus-production fork are deleted — with one set of
  strategies everywhere there is nothing left to fork on, and a vestigial
  environment split is a trap for the next cutover.
- **The primary gate is the existing access model.** Deny by default, an
  Administrator's grant as the only way to see anything, and the awaiting-access
  screen for everyone else. Unchanged by this decision; it is now the load-
  bearing part.
- **A second, optional gate: `ALLOWED_EMAIL_DOMAIN`**, a Convex environment
  variable read in `convex/access.ts`. Set, only a *verified* address ending in
  `@<domain>` may create or keep a User; everyone else is refused with the same
  opaque sentence every refusal uses. Unset, the gate is off.
- **Email is an admission filter and nothing else.** The identity key stays the
  Clerk user id. No scope check, no role check, no grant looks at an address.
  The gate can narrow who holds an account; it can never widen what one reaches.
- **The gate is re-read on every call**, not only at admission, so turning it on
  expels an account admitted while it was off.

## Consequences

- **Spec #30, story 6 is downgraded, deliberately.** "Personal accounts and
  tenant guests refused before they ever reach the app" is no longer true.
  A personal account can complete a sign-in and reach the awaiting-access
  screen — or, with the gate set, a screen that tells it to go away. It reaches
  no Plan Year, Chain Plan, Promotion, task, KPI entry or Retro either way.
  Acceptance scenarios 2, 3 and 13 were rewritten to match; the numbering did
  not move.
- **The strongest remaining factor is control of the corporate mailbox**, which
  itself sits behind the company's Microsoft sign-in and MFA. What is lost
  relative to ADR 0002 is that an attacker who has already taken over an
  employee's mailbox no longer meets a second Microsoft prompt: the mailbox *is*
  the factor rather than sitting behind one.
- **With the gate unset, the People directory is readable to any stranger who
  signs in.** Story 18 and scenario 17 make the People directory readable to
  every signed-in account so RACI pickers resolve; with the identity provider no
  longer vouching that a signed-in account is an employee, that reference data
  is the one thing an outsider can reach. Names and functions, no plan data.
  This is the concrete reason to set `ALLOWED_EMAIL_DOMAIN` in production, and
  the reason not to widen what a zero-scope Member may read.
- **Google is mostly a convenience.** With the gate set to a Microsoft shop's
  domain, "Continue with Google" only passes for whoever has a Google account on
  their work address. Email code is the path the boundary is built on; Google is
  kept because it costs one dashboard toggle and is the faster door for anyone
  it does fit.
- **Offboarding loses SCIM.** Deactivating in the Directory is still the
  immediate kill switch; deleting the Clerk user is now a manual second step
  rather than something Entra performs. The runbooks pair them.
- **Production Clerk needs a domain.** Clerk production instances require DNS
  records, which a `*.vercel.app` hostname cannot carry. Either a controlled
  domain is pointed at the Vercel project, or the pilot runs on the development
  instance. `docs/runbooks/clerk-setup.md` §B0.
- **Nothing else changed.** No schema change, no migration, no rollback change:
  the schema-pinned rollback in `cutover.md` is untouched. `convex/access.ts`
  still reads the `entra_*` claims, so adding a SAML connection on a Pro
  instance later is a dashboard change plus one environment variable — the
  access model, the tables and the tests survive it.
