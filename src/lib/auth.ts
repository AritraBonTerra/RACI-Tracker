import { useAuth, useClerk } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";

// Sign-in, as the app sees it. Clerk owns the identity handshake; this file owns
// the two questions the shell actually asks — "where do we put them back?" and
// "did the session lapse?" — and keeps every Clerk detail from leaking further
// in.
//
// One door, everywhere. Development and production run the same two strategies,
// both on Clerk's free plan: an **email verification code**, and **Continue with
// Google**. There is no environment fork left — the same prebuilt card renders
// on a laptop and in production, and the only thing an environment changes is
// which Clerk instance it points at.
//
// That is a deliberate change from the SAML-to-Entra design in #30 (see
// `docs/adr/0003-…`). The employee boundary is no longer the identity provider:
// it is the backend's deny-by-default access model, plus the optional
// `ALLOWED_EMAIL_DOMAIN` gate in `convex/access.ts`. A stranger who signs in
// with a personal Google account reaches the "access comes next" screen and no
// data whatsoever.

/**
 * Whether this build can sign anyone in, or which environment variable is
 * missing. Pure, and taking the value as an argument, because a build that
 * cannot complete a sign-in has to say so rather than render a door.
 *
 * An open door carries the key back out, trimmed. Clerk validates a publishable
 * key by prefix and payload and throws on mount if it cannot, so handing
 * `ClerkProvider` the raw environment value while deciding on the trimmed one
 * would let a key pasted into a dashboard with a stray space pass here and
 * blank the screen there.
 */
export function signInConfig(
  publishableKey: string | undefined,
): { kind: "ready"; publishableKey: string } | { kind: "unconfigured"; missing: string } {
  // An environment variable set to the empty string is Vercel's way of being
  // unset, and reads that way here too.
  const key = publishableKey?.trim() ?? "";
  if (key === "") return { kind: "unconfigured", missing: "VITE_CLERK_PUBLISHABLE_KEY" };
  return { kind: "ready", publishableKey: key };
}

export const SIGN_IN = signInConfig(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

/**
 * The path Clerk sends a Google round trip back to. Clerk derives it from the
 * instance's sign-in URL, so it arrives as `/sign-in/sso-callback` rather than
 * as a fixed path — hence the suffix match in `isSsoCallback`. Every path on
 * this app serves `index.html` (`vercel.json` rewrites, Vite's dev fallback),
 * so whichever shape Clerk picks reaches the shell.
 */
const CALLBACK_SUFFIX = "/sso-callback";

const RETURN_TO_KEY = "raci-return-to";

function appUrl(hash: string) {
  return `${window.location.origin}/${hash.startsWith("#") ? hash : ""}`;
}

/**
 * Where to put the user back after a round trip through the identity provider.
 * Recorded continuously while signed in, so an expired session returns to the
 * promotion they were reading rather than the dashboard.
 *
 * The address bar is the fallback, ahead of the dashboard: a tab reloaded on a
 * lapsed session, a browser restarted overnight, or a shared deep link opened
 * while signed out all reach the sign-in screen with the wanted page already in
 * the hash and nothing in `sessionStorage`. Sending those to the dashboard
 * would throw away the link the user just clicked.
 */
function returnTo(): string {
  const remembered = sessionStorage.getItem(RETURN_TO_KEY);
  if (remembered !== null && remembered !== "") return remembered;
  return window.location.hash === "" ? "#/" : window.location.hash;
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
 * rare case where the session could not be renewed without asking the user.
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

/** True while the browser is on the path Google's round trip returns to. */
export function isSsoCallback() {
  return window.location.pathname.endsWith(CALLBACK_SUFFIX);
}
