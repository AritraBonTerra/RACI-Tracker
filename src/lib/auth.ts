import { useAuth, useClerk, useSignIn } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Sign-in, as the app sees it. Clerk owns the identity handshake; this file owns
// the two questions the shell actually asks — "start a sign-in" and "did the
// session lapse?" — and keeps every Clerk detail from leaking further in.
//
// Two ways in, one button:
//
//   Production sets VITE_CLERK_ENTERPRISE_DOMAIN. The button calls Clerk's
//   custom redirect flow straight at the tenant's SAML enterprise connection,
//   so there is no email step in front of Microsoft. Entra refuses personal
//   accounts and other tenants before Clerk ever hears about them.
//
//   Development leaves it unset. The button opens Clerk's prebuilt sign-in
//   (email code on a development instance), because there is no corporate IdP
//   to hand off to on a laptop. Same one button, different door behind it.

export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

/** The email domain the Clerk enterprise connection is registered against. */
const ENTERPRISE_DOMAIN = import.meta.env.VITE_CLERK_ENTERPRISE_DOMAIN;

export const SIGN_IN_MODE = ENTERPRISE_DOMAIN ? "enterprise" : "development";

/** The path that finishes a redirect sign-in (see `SsoCallback`). */
const CALLBACK_PATH = "/sso-callback";

const RETURN_TO_KEY = "raci-return-to";

function appUrl(hash: string) {
  return `${window.location.origin}/${hash.startsWith("#") ? hash : ""}`;
}

/**
 * Where to put the user back after a round trip through Microsoft. Recorded
 * continuously while signed in, so an expired session returns to the promotion
 * they were reading rather than the dashboard.
 */
function returnTo(): string {
  return sessionStorage.getItem(RETURN_TO_KEY) ?? "#/";
}

/** The same place, as the absolute URL Clerk's redirect props want. */
export function returnToUrl(): string {
  return appUrl(returnTo());
}

export function useRememberLocation(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const remember = () =>
      sessionStorage.setItem(RETURN_TO_KEY, window.location.hash || "#/");
    remember();
    window.addEventListener("hashchange", remember);
    return () => window.removeEventListener("hashchange", remember);
  }, [active]);
}

/**
 * Start a sign-in. In enterprise mode this leaves the page for Microsoft; the
 * identifier only tells Clerk which enterprise connection to route to, and the
 * account that comes back is whoever Entra says it is.
 */
export function useStartSignIn() {
  const { isLoaded, signIn } = useSignIn();
  const [pending, setPending] = useState(false);

  const start = useCallback(async () => {
    // Development has no enterprise connection to route to; the sign-in screen
    // opens Clerk's prebuilt component there instead of calling this.
    if (ENTERPRISE_DOMAIN === undefined) return;
    if (!isLoaded || signIn === undefined) return;
    setPending(true);
    try {
      await signIn.authenticateWithRedirect({
        strategy: "enterprise_sso",
        identifier: `sso@${ENTERPRISE_DOMAIN}`,
        redirectUrl: `${window.location.origin}${CALLBACK_PATH}`,
        redirectUrlComplete: returnToUrl(),
      });
    } catch {
      // The redirect never happened, so the sign-in card is still on screen and
      // is the right place to try again from.
      setPending(false);
    }
  }, [isLoaded, signIn]);

  return { start, pending, ready: isLoaded };
}

/** Sign out and land back on the card with a confirmation, not a blank page. */
export function useSignOut() {
  const clerk = useClerk();
  return useCallback(async () => {
    sessionStorage.removeItem(RETURN_TO_KEY);
    markDeliberateSignOut();
    await clerk.signOut();
  }, [clerk]);
}

// A session can end two ways and the screens are different: a deliberate sign
// out gets "you're signed out", an expired one gets a way back to where the
// user was. Clerk reports both as "not signed in", so the intent is recorded at
// the moment the user asks for it.
//
// It has to outlive the JavaScript that recorded it: signing out navigates to
// `afterSignOutUrl`, which re-evaluates every module, so a variable in this
// file would be back to `false` by the time the sign-in card renders. It is
// written to `localStorage` rather than `sessionStorage` so the *other* open
// tabs — which Clerk signs out too — also say "you're signed out" instead of
// accusing the identity provider of expiring the session.
const SIGN_OUT_KEY = "raci-signed-out-at";

/** How long after the click a session ending still counts as that click. */
const SIGN_OUT_WINDOW_MS = 30_000;

function markDeliberateSignOut() {
  localStorage.setItem(SIGN_OUT_KEY, String(Date.now()));
}

function clearDeliberateSignOut() {
  localStorage.removeItem(SIGN_OUT_KEY);
}

function signedOutDeliberately(): boolean {
  const at = Number(localStorage.getItem(SIGN_OUT_KEY));
  return Number.isFinite(at) && at > 0 && Date.now() - at < SIGN_OUT_WINDOW_MS;
}

export type SessionEnding = "none" | "signedOut" | "expired";

/**
 * Why the session ended. A recorded sign-out is checked before "did this tab
 * have a session", because the navigation that follows `signOut()` throws away
 * everything this tab remembered. Clerk refreshes silently, so "expired" is the
 * rare case where Microsoft demanded a fresh interactive sign-in rather than
 * the usual invisible renewal.
 */
export function useSessionEnding(): SessionEnding {
  const { isLoaded, isSignedIn } = useAuth();
  const hadSession = useRef(false);
  const [ending, setEnding] = useState<SessionEnding>("none");

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn === true) {
      hadSession.current = true;
      clearDeliberateSignOut();
      setEnding("none");
      return;
    }
    if (signedOutDeliberately()) {
      hadSession.current = false;
      setEnding("signedOut");
      return;
    }
    if (!hadSession.current) return;
    hadSession.current = false;
    setEnding("expired");
  }, [isLoaded, isSignedIn]);

  return ending;
}

/** True while the browser is on the path Microsoft redirects back to. */
export function isSsoCallback() {
  return window.location.pathname === CALLBACK_PATH;
}
