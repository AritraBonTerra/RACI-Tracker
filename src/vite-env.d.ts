/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  /**
   * Clerk publishable key for this environment (`pk_test_…` / `pk_live_…`).
   * The only sign-in variable the frontend has: both environments run the same
   * two strategies, so nothing else distinguishes them.
   */
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
}
