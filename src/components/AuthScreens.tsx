import { AuthenticateWithRedirectCallback, SignIn } from "@clerk/clerk-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SIGN_IN_MODE, returnToUrl, useSignOut, useStartSignIn } from "../lib/auth";
import { Button, Pill } from "./ui";

// Every screen the app shows *outside* itself: the sign-in card, the two dead
// ends (no access yet, deactivated), and the rare expired session. They share
// one centered card so signing in, waiting for access, and being offboarded all
// read as the same tool in different states.
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

const MICROSOFT_SQUARES = (
  <span aria-hidden className="grid grid-cols-2 gap-px">
    <span className="h-2 w-2 bg-[#f25022]" />
    <span className="h-2 w-2 bg-[#7fba00]" />
    <span className="h-2 w-2 bg-[#00a4ef]" />
    <span className="h-2 w-2 bg-[#ffb900]" />
  </span>
);

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
 * Clerk's prebuilt sign-in, shown only on a laptop. `forceRedirectUrl` is the
 * development half of what `redirectUrlComplete` does on the enterprise path:
 * without it Clerk finishes on `/` and the page the user was reading is lost.
 */
function DevSignIn({ onBack }: { onBack: () => void }) {
  return (
    <CenterScreen>
      <SignIn routing="virtual" forceRedirectUrl={returnToUrl()} />
      <Button size="sm" variant="ghost" onClick={onBack}>
        Back
      </Button>
    </CenterScreen>
  );
}

/**
 * The only way in: one button, no password fields, no local accounts. In
 * development the button reveals Clerk's prebuilt sign-in instead of leaving
 * for Microsoft, because a laptop has no corporate identity provider behind it.
 */
export function SignInScreen({ signedOut = false }: { signedOut?: boolean }) {
  const { start, pending, ready } = useStartSignIn();
  const [showDevSignIn, setShowDevSignIn] = useState(false);

  if (showDevSignIn) return <DevSignIn onBack={() => setShowDevSignIn(false)} />;

  return (
    <CenterScreen>
      {signedOut && (
        <p className="rounded-full bg-ink-800 px-3 py-1 text-2xs text-ink-300 ring-1 ring-ink-700 ring-inset">
          You're signed out.
        </p>
      )}
      <Card>
        <div className="flex items-baseline justify-center gap-2.5">
          <Wordmark />
          <span className="text-2xs text-ink-500">Integrated Commercial Cycle</span>
        </div>
        <p className="mt-2 text-xs text-ink-400">
          Viña Concha y Toro USA — internal employees only.
        </p>
        <Button
          variant="primary"
          size="md"
          className="mt-5 w-full"
          disabled={!ready || pending}
          onClick={() => {
            if (SIGN_IN_MODE === "development") {
              setShowDevSignIn(true);
              return;
            }
            void start();
          }}
        >
          {MICROSOFT_SQUARES}
          {pending ? "Taking you to Microsoft…" : "Sign in with Microsoft"}
        </Button>
        <p className="mt-3 text-2xs leading-relaxed text-ink-500">
          Use your company Microsoft account. Access inside the tracker is
          granted by an Administrator after you first sign in.
        </p>
      </Card>
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

/** Locally deactivated: denied server-side on every call, before Entra catches up. */
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
 * provider wanted a fresh interactive sign-in. One button back through
 * Microsoft, returning to the page that was open.
 */
export function SessionExpiredScreen() {
  const { start, pending, ready } = useStartSignIn();
  const [showDevSignIn, setShowDevSignIn] = useState(false);

  if (showDevSignIn) return <DevSignIn onBack={() => setShowDevSignIn(false)} />;

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
          className="mt-4"
          disabled={!ready || pending}
          onClick={() => {
            if (SIGN_IN_MODE === "development") {
              setShowDevSignIn(true);
              return;
            }
            void start();
          }}
        >
          {MICROSOFT_SQUARES}
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
 * The page Microsoft redirects back to. Clerk finishes the handshake and sends
 * the browser on to `redirectUrlComplete`; there is nothing to render but a
 * held breath.
 */
export function SsoCallback() {
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-xs text-ink-500">Finishing sign-in…</p>
      </Card>
      <AuthenticateWithRedirectCallback />
    </CenterScreen>
  );
}

/**
 * The app is deployed without a Clerk publishable key. Said plainly rather than
 * crashing, because the fix is an environment variable, not a code change.
 */
export function AuthUnconfigured() {
  return (
    <CenterScreen>
      <Card>
        <Wordmark />
        <p className="mt-3 text-sm font-medium text-ink-100">Sign-in isn't configured.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          This build has no <code className="text-ink-200">VITE_CLERK_PUBLISHABLE_KEY</code>.
          Set it for this environment and redeploy.
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
          <Button size="sm" className="mt-3 w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
