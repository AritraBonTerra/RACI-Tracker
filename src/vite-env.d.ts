/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  /** Clerk publishable key for this environment (`pk_test_…` / `pk_live_…`). */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  /**
   * The email domain the Clerk SAML enterprise connection is registered
   * against. Set it and the sign-in button goes straight to Microsoft; leave it
   * unset (development) and the button opens Clerk's prebuilt sign-in instead.
   */
  readonly VITE_CLERK_ENTERPRISE_DOMAIN?: string;
}
