import { AuthenticateWithRedirectCallback, SignIn } from "@clerk/clerk-react";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { returnToUrl, useSignOut } from "../lib/auth";
import { Button, Pill } from "./ui";

// Every screen the app shows *outside* itself: the sign-in card, the three dead
// ends (no access yet, deactivated, not an eligible account), and the rare
// expired session. They share one centered card so signing in, waiting for
// access, and being offboarded all read as the same tool in different states.
//
// None of these is a security boundary. They exist so a refused caller sees a
// sentence instead of an error, while the backend refuses them regardless.

function Wordmark() {
  return (
    <span className="text-sm font-semibold tracking-tight whitespace-nowrap text-ink-50">
      RACI Tracker
    </span>
  );
}

function CenterScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 p-4 text-ink-100">
      {children}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-sm rounded-xl border border-ink-800 bg-ink-900/60 p-6 text-center">
      {children}
    </div>
  );
}

/**
 * The one way in, identical in development and production: Clerk's prebuilt
 * card carrying the two strategies the free plan gives us — a verification code
 * to your inbox, and "Continue with Google".
 *
 * `withSignUp` is what makes it one card rather than two: an employee signing
 * in for the first time has no Clerk account yet, and without it Clerk answers
 * their address with "couldn't find your account" and a link elsewhere.
 *
 * `forceRedirectUrl` is why a Google round trip comes back to the promotion the
 * user was reading; without it Clerk finishes on `/`.
 */
function ClerkSignIn() {
  return (
    <SignIn
      routing="virtual"
      withSignUp
      forceRedirectUrl={returnToUrl()}
      signUpForceRedirectUrl={returnToUrl()}
    />
  );
}

/**
 * The only way in: an email code or Google, no password fields, no local
 * accounts. Nothing here is the employee boundary — anyone who completes a
 * sign-in reaches `NoAccessScreen` and nothing else until an Administrator
 * grants them a scope (and, where `ALLOWED_EMAIL_DOMAIN` is set on the Convex
 * deployment, not even that).
 */
export function SignInScreen({ signedOut = false }: { signedOut?: boolean }) {
  return (
    <CenterScreen>
      {signedOut && (
        <p className="rounded-full bg-ink-800 px-3 py-1 text-2xs text-ink-300 ring-1 ring-ink-700 ring-inset">
          You're signed out.
        </p>
      )}
      <div className="flex items-baseline justify-center gap-2.5">
        <Wordmark />
        <span className="text-2xs text-ink-500">Integrated Commercial Cycle</span>
      </div>
      <p className="text-xs text-ink-400">
        Viña Concha y Toro USA — internal employees only.
      </p>
      <ClerkSignIn />
      <p className="max-w-sm text-center text-2xs leading-relaxed text-ink-500">
        Use your company work address. Access inside the tracker is granted by an
        Administrator after you first sign in.
      </p>
    </CenterScreen>
  );
}

/** Signed in fine — no Administrator has granted anything yet (#30, story 2). */
export function NoAccessScreen({ email }: { email?: string }) {
  const signOut = useSignOut();
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">
          You're signed in — access comes next.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {email === undefined ? (
            "An Administrator has to grant you a Plan Year, Chain Plan, or Promotion before anything shows here."
          ) : (
            <>
              Signed in as <span className="text-ink-200">{email}</span>. An
              Administrator has to grant you a Plan Year, Chain Plan, or
              Promotion before anything shows here.
            </>
          )}{" "}
          Your sign-in is already on their list.
        </p>
        <Button size="md" className="mt-4" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    </CenterScreen>
  );
}

/**
 * The account signed in, and the deployment's `ALLOWED_EMAIL_DOMAIN` gate does
 * not admit it (#30, story 6, as downgraded in `docs/adr/0003-…`). No User row
 * exists and none will: every backend call from this identity is refused with
 * the same sentence every other refusal uses. This screen only names the way
 * out.
 */
export function IneligibleScreen({ email }: { email?: string }) {
  const signOut = useSignOut();
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">
          This account can't be used here.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {email === undefined ? "That account" : <span className="text-ink-200">{email}</span>}{" "}
          isn't a Viña Concha y Toro USA work account. Sign out and sign back in
          with your company address.
        </p>
        <Button size="md" className="mt-4" onClick={() => void signOut()}>
          Back to sign-in
        </Button>
      </Card>
    </CenterScreen>
  );
}

/** Locally deactivated: denied server-side on every call, immediately. */
export function DeactivatedScreen({ email }: { email?: string }) {
  const signOut = useSignOut();
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">
          This account is deactivated.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {email === undefined ? "This account" : <span className="text-ink-200">{email}</span>}{" "}
          no longer has access to RACI Tracker. If that's unexpected, contact an
          Administrator.
        </p>
        <Button size="md" className="mt-4" onClick={() => void signOut()}>
          Back to sign-in
        </Button>
      </Card>
    </CenterScreen>
  );
}

/**
 * Sessions refresh silently, so this is the rare case where the identity
 * provider wanted a fresh interactive sign-in. The message comes first and the
 * card second, so "your session expired" is read rather than guessed at from a
 * sign-in form appearing over the work that was open. Either strategy returns
 * to that page, because `returnToUrl` was recorded while the session was live.
 */
export function SessionExpiredScreen() {
  const [signingIn, setSigningIn] = useState(false);

  if (signingIn) {
    return (
      <CenterScreen>
        <ClerkSignIn />
        <Button size="sm" variant="ghost" onClick={() => setSigningIn(false)}>
          Back
        </Button>
      </CenterScreen>
    );
  }

  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">Your session expired.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          Sign in again to pick up exactly where you left off.
        </p>
        <Button
          variant="primary"
          size="md"
          className="mt-4 w-full"
          onClick={() => setSigningIn(true)}
        >
          Sign in again
        </Button>
      </Card>
    </CenterScreen>
  );
}

/** Nothing to say yet: Clerk and Convex are still deciding who is calling. */
export function AuthPending() {
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-xs text-ink-500">Checking your sign-in…</p>
      </Card>
    </CenterScreen>
  );
}

/**
 * The page Google's round trip returns to. Clerk finishes the handshake and
 * sends the browser on; there is nothing to render but a held breath.
 *
 * The two redirect props repeat what the sign-in card already asked for. Clerk
 * normally carries that through the round trip itself, but `returnToUrl` reads
 * `sessionStorage`, which survives the redirect in this tab — so saying it
 * again here costs nothing and covers the case where it did not.
 */
export function SsoCallback() {
  const back = returnToUrl();
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-xs text-ink-500">Finishing sign-in…</p>
      </Card>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl={back}
        signUpForceRedirectUrl={back}
      />
    </CenterScreen>
  );
}

/**
 * The app is deployed without the environment variables sign-in needs. Said
 * plainly rather than crashing — and rather than opening a door that cannot
 * work — because the fix is an environment variable, not a code change.
 */
export function AuthUnconfigured({ missing }: { missing: string }) {
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">Sign-in isn't configured.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          This build has no <code className="text-ink-200">{missing}</code>. Set it
          for this environment and redeploy.
        </p>
      </Card>
    </CenterScreen>
  );
}

/**
 * The avatar menu in the header: who you are, what you are, and the way out.
 * Role and Person link are display only — the backend re-checks both on every
 * call, so a doctored menu buys nothing.
 */
export function AccountMenu({
  displayName,
  email,
  role,
}: {
  displayName?: string;
  email?: string;
  role: "administrator" | "member";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = displayName ?? email ?? "Account";
  const initials = label
    .split(/[\s@.]+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-sand-400 text-xs font-semibold text-ink-fixed transition hover:bg-sand-500"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-ink-700 bg-ink-900 p-3 text-left shadow-2xl shadow-black/50">
          <p className="truncate text-sm font-semibold text-ink-100">{label}</p>
          {email !== undefined && (
            <p className="truncate text-2xs text-ink-500">{email}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill className="bg-ink-800 text-ink-300 ring-1 ring-ink-700 ring-inset">
              {role === "administrator" ? "Administrator" : "Member"}
            </Pill>
          </div>
          <MyScopes open={open} role={role} />
          <Button size="sm" className="mt-3 w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * What the signed-in account can reach, in their own words (#30, story 17). A
 * Member is entitled to know exactly what they have — and to nothing about
 * anybody else's, which is why this reads the one function on the access
 * surface that answers only about the caller.
 *
 * Asked only while the menu is open: a scope list nobody is looking at is a
 * subscription on every page for a line of text behind a click.
 */
function MyScopes({
  open,
  role,
}: {
  open: boolean;
  role: "administrator" | "member";
}) {
  const mine = useQuery(api.directory.myAccess, open ? {} : "skip");
  if (role === "administrator") {
    return (
      <p className="mt-2 text-2xs text-ink-500">Reaches every plan year in full.</p>
    );
  }
  if (mine === undefined) return null;
  if (mine.scopes.length === 0) {
    return (
      <p className="mt-2 text-2xs text-ink-500">
        No access granted yet — an Administrator is next.
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <p className="text-3xs font-semibold tracking-wide text-ink-600 uppercase">
        Your access
      </p>
      {mine.scopes.map((scope) => (
        <p key={scope.label} className="truncate text-2xs text-ink-400">
          {scope.label}
        </p>
      ))}
    </div>
  );
}
