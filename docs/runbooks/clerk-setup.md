# Clerk and Entra setup

Everything sign-in needs that is not code. All of it happens in the Clerk and
Microsoft Entra dashboards, which no agent can reach, so this file is the
written form of those clicks. The repo half — `convex/auth.config.ts`,
`convex/access.ts`, `src/lib/auth.ts` — is already in place and needs no
changes as you work through this.

Two environments, set up in this order: development first, so the whole flow
can be exercised on a laptop with no corporate identity provider involved, then
production, where Entra becomes the boundary.

---

## A. Development instance (do this first)

A Clerk **development** instance is free and includes enterprise connections,
so nothing here costs anything.

1. **Create the Clerk application.** `bunx clerk@latest init` from the repo
   root, or create it at [dashboard.clerk.com](https://dashboard.clerk.com).
   One application, two instances (development and production) — that is
   Clerk's own model, not two applications.
2. **Sign-in strategies.** In *User & Authentication → Email, Phone, Username*,
   leave **email code** on and turn **password** off. Turn off every social
   connection. Development sign-in is a code to your inbox; that is deliberate.
3. **Turn on the Convex integration.** *Integrations → Convex*. This maps
   `aud: "convex"` into the default session token, which is what
   `convex/auth.config.ts` expects. Do **not** create a `convex` JWT template —
   the template path is legacy, and claims placed there are silently dropped by
   recent Convex clients.
4. **Add the email claim.** *Sessions → Customize session token* and add:

   ```json
   { "email": "{{user.primary_email_address}}" }
   ```

   Without it `identity.email` is undefined and every User is created with no
   email, which makes `bootstrap:grantAdmin --email` unusable.
5. **Copy the two values** from *API keys* and *Domains*:

   - Publishable key (`pk_test_…`) → `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`
   - Frontend API URL (`https://<slug>.clerk.accounts.dev`) → the Convex dev
     deployment:

     ```sh
     bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<slug>.clerk.accounts.dev
     ```

   Leave `VITE_CLERK_ENTERPRISE_DOMAIN` unset locally. That is the switch that
   keeps the sign-in button on the development door.
6. **Run it.** `bun run convex` and `bun run dev` in two terminals, open the
   app, sign in with an email code. You should land on "You're signed in —
   access comes next".
7. **Become an Administrator.**

   ```sh
   bunx convex run bootstrap:listUsers
   bunx convex run bootstrap:grantAdmin '{"email":"you@example.com"}'
   ```

   The screen changes without a reload — Convex reactivity carries the role
   change to the open client.

---

## B. Production instance

Needs **Clerk Pro** ($25/mo, or $20/mo billed annually). Enterprise connections
are not available on production instances of the free plan.

1. **Upgrade to Pro** and promote the instance (`bunx clerk deploy`, or
   *Production* in the Dashboard). Register the app domain and add the DNS
   records Clerk asks for.
2. **Create the Entra enterprise application** (Entra admin centre →
   *Enterprise applications* → *New application* → *Create your own*):
   - *Single sign-on* → **SAML**.
   - Fill in the Identifier (Entity ID) and Reply URL that Clerk shows on the
     connection you create in step 3.
   - Set **Assignment required = Yes** and assign the employees who should have
     the tool. This is a second, Entra-side employee gate that no app code can
     weaken; keep it on.
   - Copy the **App Federation Metadata URL**. Clerk needs only this — there is
     no client secret to rotate.
3. **Create the Clerk SAML connection** (*Enterprise connections → Add
   connection → SAML → Microsoft Entra ID*), paste the metadata URL, and set
   the connection's email domain to the company domain.
4. **Map the Entra claims.** In the enterprise application's SAML claim
   configuration add three claims — the `public_metadata_` prefix is what puts
   them on the Clerk user:

   | Claim name | Source attribute | Lands as |
   | --- | --- | --- |
   | `public_metadata_entra_oid` | `user.objectid` | `publicMetadata.entra_oid` |
   | `public_metadata_entra_tid` | `user.tenantid` | `publicMetadata.entra_tid` |
   | `public_metadata_entra_usertype` | `user.usertype` | `publicMetadata.entra_usertype` |

   Then extend the production session token customization to:

   ```json
   {
     "email": "{{user.primary_email_address}}",
     "entra_oid": "{{user.public_metadata.entra_oid}}",
     "entra_tid": "{{user.public_metadata.entra_tid}}",
     "entra_usertype": "{{user.public_metadata.entra_usertype}}"
   }
   ```

   `convex/access.ts` reads all three and stores whichever arrive. If
   `user.usertype` turns out not to be selectable in the Entra claim editor,
   nothing breaks — guest exclusion falls back to Entra app assignment.
5. **Close the other doors.** On the production instance turn off email code,
   email link, password, and every social connection, leaving enterprise SSO as
   the only strategy.
6. **Enable SCIM Directory Sync** (Entra: enterprise application →
   *Provisioning* → Automatic). Free with the connection, and the reason
   offboarding needs no manual Clerk step: an Entra disable deactivates the
   Clerk user and revokes their sessions.
7. **Set the production environment variables.**

   ```sh
   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain> --prod
   ```

   In the Vercel project, for the Production environment:

   - `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`
   - `VITE_CLERK_ENTERPRISE_DOMAIN` = the company email domain (e.g.
     `vctusa.com`). **Setting this is what turns the button into one hop to
     Microsoft.** Leave it unset and production would show the development
     sign-in widget.

---

## Verify before trusting it

- One button on the card, no email field, no password field.
- A personal Microsoft account (`@outlook.com`) is refused **by Microsoft**,
  before the app renders anything.
- An employee not assigned to the Entra enterprise application is refused by
  Entra.
- First sign-in lands on "access comes next" and appears in
  `bunx convex run bootstrap:listUsers --prod`.
- Sign out returns to the card with "You're signed out."
- `bunx convex run bootstrap:grantAdmin '{"email":"…"}' --prod` promotes, and
  the open client changes without a reload.

## Granting access

Until the Directory surface lands (#34), grants are handed out with deploy
credentials, from the same family as the bootstrap functions. A grant names one
Plan Year, Chain Plan or Promotion, and access flows down from it:

```sh
bunx convex run bootstrap:listUsers --prod
bunx convex run bootstrap:grantAccess \
  '{"email":"them@company.com","scope":{"tier":"chainPlan","chainPlanId":"<id>"}}' --prod
bunx convex run bootstrap:revokeAccess \
  '{"email":"them@company.com","scope":{"tier":"chainPlan","chainPlanId":"<id>"}}' --prod
```

`tier` is `season` (the Plan Year), `chainPlan`, or `promotion`, with the
matching `seasonId` / `chainPlanId` / `promotionId` beside it — take the id
straight out of the URL of the page you want them to have. Both calls return
the User's resulting scopes, and both write an Audit event. Grants are a union:
handing out a second, overlapping one is harmless, and revoking it takes back
only that row. The open client updates without a reload either way.

Administrators reach everything, so `grantAccess` refuses to give one an
assignment rather than storing a row that means nothing.

## What this does *not* protect yet

Finishing this runbook gets you sign-in and **scoped reads**. Every public query
resolves the caller's identity server-side and answers only over the records
their Access Assignments reach; an out-of-scope link is answered with the same
`null` a deleted record gets.

Writes are not there yet. Every mutation — `tasks`, `promotions`, `seasons`,
`people`, and the rest — is still a bare `mutation`, so a caller holding any
Convex client can *change* every record without a token. The remaining modules
and the exact factories they still reach for are listed as `AWAITING_MIGRATION`
in `convex/accessBoundary.test.ts`; that table has to be empty before this
deployment holds anything an outsider must not be able to edit. Until then,
treat the production data as writable by anyone with the URL.

The app itself shows a Member only the affordances their role has — creating a
plan year, a chain plan or a promotion, and deleting a plan or a promotion, are
all Administrator-only buttons — but that is the interface being honest, not a
guard. The guard arrives with the scoped writes.

## Break-glass

If every Administrator is locked out, whoever holds the Convex deploy
credentials runs:

```sh
bunx convex run bootstrap:listUsers --prod
bunx convex run bootstrap:grantAdmin '{"email":"someone@company.com"}' --prod
```

`grantAdmin` reactivates as it promotes, so a deactivation cannot make the
lockout permanent. Keep **two** active Administrators so this stays a drill.

## Open questions worth confirming on the real connection

- Whether `identifier: "sso@<domain>"` routes to the enterprise connection
  cleanly for a user who has never signed in. If Clerk objects, the fallback is
  the experimental `enterpriseConnectionId` parameter, or accepting one email
  step in front of Microsoft.
- Whether the `public_metadata_` claims land in time for the **first** session
  token after sign-up, or only from the second sign-in. `ensureUser` already
  tolerates their absence and fills them in on a later sign-in, so this is a
  question of when the data appears, not whether sign-in works.
