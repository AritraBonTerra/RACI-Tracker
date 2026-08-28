# Microsoft Entra and Convex integration

Research date: 2026-08-27

## Decision

Use a Microsoft Entra workforce app registration configured as a single-tenant single-page application. The React client should use the current `@azure/msal-browser` and `@azure/msal-react` packages to obtain a Microsoft Entra v2 OIDC ID token through the authorization code flow with PKCE. A custom `ConvexProviderWithAuth` adapter should return that ID token to the Convex client. Convex should validate it through a tenant-specific custom OIDC provider in `convex/auth.config.ts`.

Do not add a login proxy, a custom JWT issuer, Microsoft Graph access, or a client secret. Authentication proves the Microsoft identity. It must not grant application access on its own. Every public Convex function must also require an active local User and enforce that User's authorization.

## Supported end-to-end flow

1. Register a Microsoft Entra application with the supported account type "Accounts in this organizational directory only" and add the web client under the Single-page application platform. This setting is also represented by `signInAudience: "AzureADMyOrg"`. Microsoft documents `@azure/msal-browser` as the current SPA library and says it uses the authorization code flow with PKCE, not the implicit flow. [Tenancy in Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/single-and-multi-tenant-apps), [MSAL Browser overview](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/about-msal-browser)
2. Configure MSAL with one `PublicClientApplication` instance and the tenant-specific authority `https://login.microsoftonline.com/<tenant-id>`. Do not use `common` or `organizations`. Microsoft requires a tenant-specific authority for a single-tenant client. [MSAL initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
3. Request only the OIDC scopes needed for sign-in, `openid profile email`. MSAL adds its standard OIDC scopes as needed. No Microsoft Graph delegated permission is needed for this integration. The `openid` scope yields the ID token, while `profile` yields claims including `oid`; `email` is optional and may still be absent. [Microsoft identity platform scopes](https://learn.microsoft.com/en-us/entra/identity-platform/scopes-oidc), [ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference)
4. Wrap the application in `MsalProvider`, then replace the existing `ConvexProvider` with `ConvexProviderWithAuth`. The adapter should report the MSAL loading and authentication state and implement `fetchAccessToken`. Despite that callback's name, it must return `AuthenticationResult.idToken`, because Convex's custom OIDC integration expects an ID token. When Convex sets `forceRefreshToken`, pass the corresponding force-refresh option to `acquireTokenSilent`; if Microsoft requires interaction, start the chosen redirect flow and return no token for that attempt. [Convex custom OIDC provider](https://docs.convex.dev/auth/advanced/custom-auth), [Convex authentication manager source](https://github.com/get-convex/convex-js/blob/main/src/browser/sync/authentication_manager.ts), [MSAL token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token)
5. Configure Convex with exactly one provider for each deployment:

   ```ts
   import type { AuthConfig } from "convex/server";

   const tenantId = process.env.ENTRA_TENANT_ID!;

   export default {
     providers: [
       {
         domain: `https://login.microsoftonline.com/${tenantId}/v2.0`,
         applicationID: process.env.ENTRA_CLIENT_ID!,
       },
     ],
   } satisfies AuthConfig;
   ```

   `domain` must exactly match the token's `iss` claim and `applicationID` must exactly match `aud`. Microsoft publishes tenant-specific discovery metadata at `https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration`; that metadata points to Microsoft's rotating signing keys. Convex uses the OIDC configuration to validate the ID token before exposing an identity to functions. [Convex custom OIDC provider](https://docs.convex.dev/auth/advanced/custom-auth), [Microsoft OIDC endpoints](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [Microsoft signing-key discovery](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/troubleshooting-signature-validation-errors)
6. Run `npx convex dev` after changing auth configuration and `npx convex deploy` for production. A source file alone does not update the deployed provider configuration. [Convex authentication debugging](https://docs.convex.dev/auth/debug)

## Tenant and employee enforcement

Single-tenant registration is necessary but not sufficient. Microsoft explicitly says a single-tenant application admits both users and guests in that directory. The specification should require all of these controls:

- Set the Enterprise application's "Assignment required" property to Yes. Assign only the internal employees allowed to use RACI Tracker. With assignment required, an unassigned directory account cannot obtain a token for the application. Direct user assignment is supported. Group-based assignment requires Microsoft Entra ID P1 or P2, and nested groups are not supported. [Manage access to an application](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/what-is-access-management), [Enterprise application properties](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/application-properties)
- Add the optional `acct` claim to ID tokens and reject an identity unless `acct` is `0`. Microsoft defines `0` as a tenant member and `1` as a guest. This is a useful guard against accidentally assigning a guest, but it is not the sole application allowlist. [Optional claims reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- In every public Convex query, mutation, and action, call `ctx.auth.getUserIdentity()`, reject `null`, require `identity.tid` to equal the configured tenant, require a valid `identity.oid`, require `identity.acct` to be `0`, and load an active local User before reading or writing protected data. Convex returns `null` for an unauthenticated query, mutation, or action, so client route guards alone do not protect data. [Auth in Convex functions](https://docs.convex.dev/auth/functions-auth), [Convex Auth API](https://docs.convex.dev/api/interfaces/server.Auth)
- Treat the local User record and its access assignments as the final authorization source. Entra assignment controls who can authenticate to this application. It does not model Administrator, Season, Chain Plan, or Promotion access.

If the organization cannot enable "Assignment required," the local active-User check remains mandatory and becomes the definitive employee allowlist. The product should show a signed-in but unauthorized page without issuing protected queries.

## Identity claims and keys

Use `(tid, oid)` as the external identity key in application data.

- `tid` is the immutable tenant ID for the tenant in which the account signed in.
- `oid` is the immutable object ID for that user in that tenant and is consistent across applications in the same tenant.
- `sub` is pairwise per application ID. Separate development and production app registrations produce different `sub` values for the same person.
- Convex's `tokenIdentifier` combines `iss` and `sub` and is globally unique. It is safe inside one provider configuration, but it is not the right cross-environment account key when each environment has its own Entra client ID.
- `name`, `preferred_username`, and `email` are display attributes only. Microsoft says they are mutable and must not drive authorization. The `email` claim is not guaranteed to exist.

Convex surfaces OIDC standard fields and additional token claims through `UserIdentity`. The implementation must validate the type and presence of Microsoft-specific `tid`, `oid`, and `acct` claims before using them. [Microsoft ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference), [Convex UserIdentity](https://docs.convex.dev/api/interfaces/server.UserIdentity)

## Redirect and logout behavior

Use one interaction style throughout the application. Redirect is the better default for this internal SPA because it does not depend on popup permission.

- The current MSAL Browser v5 requires a dedicated redirect bridge. Add `redirect.html` as a separate Vite build entry, import `broadcastResponseToMainFrame` from `@azure/msal-browser/redirect-bridge`, and register its exact URL as an SPA redirect URI in Entra. Do not send a `Cross-Origin-Opener-Policy` header on that bridge response. [MSAL redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- Register each development and production redirect URI exactly, including scheme, host, port, and path. Unregistered preview origins cannot sign in. Do not use wildcards or accept a runtime return URL that Entra has not registered. [MSAL redirect URI configuration](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- Preserve the in-app path that initiated login in MSAL request state and restore it only after validating it as a same-origin application path. Default to the application's home page if it is missing or invalid.
- Sign out with `logoutRedirect`, pass the active account, and configure a registered same-origin `postLogoutRedirectUri`. This clears the MSAL cache and completes the Entra server sign-out. Do not implement local-only logout because the Entra session would immediately sign the user back in. Microsoft notes that server sign-out is best effort and can fail if navigation is interrupted. [MSAL logout](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout)
- Front-channel single sign-out from other Microsoft applications is optional for this feature. It needs a dedicated HTTPS endpoint and still has browser storage-partitioning limits. The app's own logout flow does not depend on it. [MSAL front-channel logout](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/logout), [third-party cookie limits](https://learn.microsoft.com/en-us/entra/identity-platform/reference-third-party-cookies-spas)

## Session behavior

Use MSAL's default `sessionStorage` cache for the first release. It supports redirect flow, is scoped to one tab, and clears when the tab closes. `localStorage` shares state across tabs but persists more authentication material. Microsoft describes this as a usability and security tradeoff. [MSAL cache behavior](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching)

Closing a tab does not necessarily end the Microsoft session cookie, so a later visit may sign in silently. This is expected Microsoft SSO behavior, not an application password session.

Microsoft ID tokens are normally valid for about one hour. Convex schedules refresh based on `iat` and `exp`, and its custom auth adapter asks for a fresh token when expiry approaches or the backend rejects the current token. MSAL should first attempt `acquireTokenSilent`, which reads or renews its cached tokens, and use redirect interaction only when Microsoft requires it. [Microsoft ID token lifetime](https://learn.microsoft.com/en-us/entra/identity-platform/id-tokens), [Convex authentication manager source](https://github.com/get-convex/convex-js/blob/main/src/browser/sync/authentication_manager.ts), [MSAL token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token)

Removing an Entra assignment or disabling an Entra account may not invalidate an ID token that Convex already accepted. For prompt application revocation, an Administrator must be able to deactivate the local User, and every protected Convex function must check that active flag. Entra removal then prevents the next token acquisition. No authorization result should be cached in the browser as an enforcement mechanism.

## Configuration and secret boundaries

The SPA is a public client. It must not have or use a client secret.

| Value | Location | Secret? |
| --- | --- | --- |
| Entra tenant ID | Frontend `VITE_ENTRA_TENANT_ID`; matching Convex deployment variable `ENTRA_TENANT_ID` | No, but keep the actual value out of issues and source as an operational preference |
| Entra application client ID | Frontend `VITE_ENTRA_CLIENT_ID`; matching Convex deployment variable `ENTRA_CLIENT_ID` | No |
| Convex deployment URL | Existing frontend `VITE_CONVEX_URL` | No |
| Redirect and post-logout URIs | Entra registration plus frontend configuration | No |
| Convex deploy key | Hosting or CI secret store only | Yes |
| ID, refresh, and access tokens | MSAL-managed browser cache only | Yes, never log or persist in application data |

Vite replaces `VITE_*` values into the browser bundle, so no secret may use that prefix. Convex deployment variables are set per deployment and can supply `auth.config.ts`; set them separately for development and production. [Vite environment variables](https://vite.dev/guide/env-and-mode), [Convex environment variables](https://docs.convex.dev/production/environment-variables), [Convex development and production auth configuration](https://docs.convex.dev/auth/auth0)

Use separate Entra app registrations for development and production. Pair each with its corresponding Convex deployment and frontend build. This keeps redirect URIs, consent, tokens, and rollout changes from crossing environments. It also makes the `(tid, oid)` identity key important because `sub` changes with the client ID.

## Product and dependency constraints

- Convex documents generic OIDC as an advanced custom-provider feature. It is supported, but it does not have the prebuilt React wrapper that Convex supplies for Clerk or Auth0. The project owns the small MSAL-to-`ConvexProviderWithAuth` adapter and must test token refresh and logout. [Convex custom OIDC provider](https://docs.convex.dev/auth/advanced/custom-auth)
- Current Convex pricing lists application Auth on Free and Starter. The SAML/SSO item on Business and Enterprise concerns team-member access to the Convex dashboard and CLI, not this application's Entra OIDC integration. No Convex plan upgrade is documented as a requirement for custom OIDC app authentication. Resource and concurrent-session limits still apply to the selected deployment class. [Convex pricing](https://www.convex.dev/pricing), [Convex team SSO](https://docs.convex.dev/team-management/sso), [Convex limits](https://docs.convex.dev/production/state/limits)
- Current MSAL React v5 requires React 19.2.1 or newer and recommends Vite. This repository's lockfile resolves React and React DOM to 19.2.8, so it meets that requirement even though `package.json` declares `^19.2.0`. Keep the resolved React version at or above 19.2.1 when adding `@azure/msal-browser@^5` and `@azure/msal-react@^5`. [MSAL React v5 migration](https://learn.microsoft.com/en-us/entra/msal/javascript/react/migration-guide-v4-v5)
- Group assignment to the Entra Enterprise application needs Entra ID P1 or P2. Direct employee assignment avoids that group-assignment requirement. Conditional Access, automated group lifecycle, and Microsoft-side access reviews are tenant administration enhancements, not prerequisites for the base sign-in flow. [Microsoft application access management](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/what-is-access-management)
- Account credentials, MFA, password reset, and recovery remain entirely with Microsoft Entra and the organization's IT process. RACI Tracker should never collect a Microsoft password. It only needs an error path that directs a user to Microsoft self-service password reset when the tenant enables it, or to the organization's support contact. [Microsoft Entra self-service password reset](https://learn.microsoft.com/en-us/entra/identity/authentication/concept-sspr-deploy)

## Requirements this hands to later decisions

Later specification tickets should assume these fixed boundaries:

- Authentication identity is `(tid, oid)` from a Convex-validated Entra v2 ID token.
- A valid token never implies application access. An active local User and a scope check are required on every protected Convex function.
- Administrator and Member permissions remain in Convex data, not Entra app roles or groups.
- The app must support an unauthorized signed-in state without loading protected data.
- Local User deactivation is the immediate revocation control; Entra assignment removal is the next-token control.
- Development and production use separate Entra app registrations and matching Convex deployments.
- No Microsoft Graph permission, client secret, custom token service, or extra auth vendor is part of this feature.
