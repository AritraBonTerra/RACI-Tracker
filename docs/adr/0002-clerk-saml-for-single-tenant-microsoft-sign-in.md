# 2. Clerk with a SAML enterprise connection for Microsoft sign-in

Date: 2026-08-27

## Status

Superseded by [ADR 0003](0003-clerk-free-tier-email-code-and-google.md) on
2026-08-28 — the $25/mo Clerk Pro cost was rejected, and the Entra app
registration this decision depends on turned out not to be available. Kept as
written, because it is the design to return to if IT ever engages.

## Context

The tool ran at a public URL with no authentication. It needed single-tenant
Microsoft sign-in — every employee of Viña Concha y Toro USA in, everyone else
structurally out, with no separate password anywhere.

Three routes were live. A hand-rolled MSAL browser client with a custom Convex
OIDC provider costs nothing but means owning the token bridge, the sign-in UI,
and an offboarding step that no system performs for us. Clerk's **Microsoft
social connection** and **EASIE** are the paths Clerk's own documentation
steers you to, and both are disqualified by the same sentence: Clerk supports
"only the `common` tenant type", so the app registration must admit personal
Microsoft accounts, and the boundary degrades from a tenant to an email domain.
Clerk's **SAML enterprise connection** points at the tenant's own Entra
enterprise application, which belongs to exactly one tenant.

Cost mattered: Clerk Pro is $25/mo against $0 for MSAL. That is why this
decision was made, reversed on cost, and then reinstated.

## Decision

Clerk Pro with a SAML enterprise connection to the company's Entra enterprise
application, and Convex's standard Clerk integration for token verification.

- The sign-in surface is a **custom flow**, not the prebuilt `<SignIn />`
  widget: `signIn.authenticateWithRedirect({ strategy: "enterprise_sso" })` with
  an identifier whose domain routes to the one connection. The prebuilt widget
  is email-first and cannot jump straight to a named connection, and the
  product decision is one button and nothing else.
- **Development instances stay on email-code sign-in**, and the same button
  opens Clerk's prebuilt component there. A laptop has no corporate IdP behind
  it, and shipping a second code path is cheaper than pretending it does.
- The identity key stored on a User is the **Clerk user id** (`sub`). The
  durable Microsoft `(tid, oid)` pair rides along in custom claims via Clerk's
  SAML attribute mapping, kept as defence in depth rather than the boundary.
- **Entra "Assignment required" stays on**, so app assignment remains a second,
  Entra-side employee gate that no app code can weaken.

## Consequences

- Personal Microsoft accounts and other tenants are refused by Microsoft before
  Clerk hears about them. The employee boundary does not depend on our code.
- $300/year, and a third party now processes employee names and email
  addresses. No record content leaves Convex.
- The trust chain gains a hop: Convex verifies Clerk's signature over an Entra
  fact, not Entra's signature over a live one. SCIM Directory Sync closes the
  practical gap by revoking sessions when Entra disables an account.
- Conditional Access no longer bounds session length — Clerk's maximum lifetime
  does, and has to be aligned by hand if the tenant tightens sign-in frequency.
- The SAML connection, attribute mapping, and JWT/session-token customization
  are Dashboard work, not repo work. `docs/runbooks/clerk-setup.md` is the
  written form; the repo cannot verify it.
- The access model is provider-agnostic. If cost reverses this again, the
  `users` / `accessAssignments` / `auditEvents` tables and the whole access
  module survive; only `auth.config.ts` and `src/lib/auth.ts` change.
