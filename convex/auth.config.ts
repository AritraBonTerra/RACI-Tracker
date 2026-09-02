import type { AuthConfig } from "convex/server";

// Convex verifies Clerk-issued JWTs against Clerk's JWKS, so the only thing it
// needs is the issuer. `CLERK_JWT_ISSUER_DOMAIN` is Clerk's Frontend API URL
// (`https://<slug>.clerk.accounts.dev` in development, `https://clerk.<domain>`
// in production) and must equal the token's `iss` exactly. There is no Clerk
// secret key here on purpose: signature verification needs only the public key.
//
// `applicationID` is the literal "convex" — the `aud` claim the Clerk
// Dashboard's Convex integration pre-maps into the default session token.
//
// Set per deployment: `bunx convex env set CLERK_JWT_ISSUER_DOMAIN <url>`
// (add `--prod` for production). The `!` is deliberate: Convex's push path
// detects `process.env.X` reading undefined in this file and fails the deploy
// with "Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config
// file but its value was not set", naming the variable and linking the
// dashboard. Defaulting to `""` would defeat that detection and trade a precise
// deploy failure for an issuer that silently matches no token.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
