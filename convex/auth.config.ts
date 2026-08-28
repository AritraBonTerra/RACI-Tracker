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
// (add `--prod` for production). Missing it means every call is anonymous,
// which the access module denies — the app fails closed, not open.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
