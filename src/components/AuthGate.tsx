import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import {
  isSsoCallback,
  useAdoptStrandedSession,
  useRememberLocation,
  useSessionEnding,
} from "../lib/auth";
import {
  AuthPending,
  DeactivatedScreen,
  IneligibleScreen,
  NoAccessScreen,
  SessionExpiredScreen,
  SignInScreen,
  SsoCallback,
} from "./AuthScreens";

// The one place the app decides which world the caller is in. Everything the
// gate renders instead of the app is a full-screen state, never a partial app
// with things greyed out.
//
// This is presentation, not protection. The backend re-resolves identity on
// every call, so a caller who gets past this gate by editing their own
// JavaScript reaches exactly the same refusals.

function useMe() {
  return useQuery(api.access.me, {});
}

type Me = NonNullable<ReturnType<typeof useMe>>;
type Viewer = Extract<Me, { state: "active" }>;
type Account = Viewer["account"];

const ViewerContext = createContext<Viewer | null>(null);

/** How long a failed `ensureUser` waits before trying again, and how often. */
const ENSURE_RETRY_MS = 3000;
const ENSURE_RETRY_LIMIT = 3;

function useViewer(): Viewer {
  const viewer = useContext(ViewerContext);
  if (viewer === null) {
    throw new Error("The viewer is only available inside a signed-in shell.");
  }
  return viewer;
}

/** The signed-in account behind the shell. Only valid inside `AuthGate`. */
export function useAccount(): Account {
  return useViewer().account;
}

/**
 * Whether the shell renders the Administrator's surfaces. Shaping only — every
 * function the hidden surfaces would call re-checks the role server-side, so a
 * Member who forces this true gets a screen full of refusals rather than access.
 */
export function useIsAdministrator(): boolean {
  return useViewer().account.role === "administrator";
}

/** Where the shell opens: the dashboard, or straight into the one Promotion. */
export function useLanding(): Viewer["landing"] {
  return useViewer().landing;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading } = useConvexAuth();
  const ending = useSessionEnding();
  // An in-page sign-in can complete without this tab activating the session
  // (see `useAdoptStrandedSession`); adopt it here or the gate waits forever.
  useAdoptStrandedSession();
  const me = useMe();
  const ensureUser = useMutation(api.access.ensureUser);
  // The account `ensureUser` last settled for this tab, so one sign-in calls it
  // once — including the first, whose create answers with the id `me` is about
  // to report, and so does not trigger a second call when it does.
  const ensuredFor = useRef<string | null>(null);

  // Once per signed-in identity, not only the first time: the first call
  // creates the User, every later one refreshes the name and address off the
  // token, so a renamed employee is renamed in the Directory too. Convex has
  // already verified the token by the time this lands, so the record is built
  // from claims, not from anything the browser says about itself.
  //
  // An ineligible identity calls it too: the call is refused, but on the way it
  // brings a known row's address up to date, which is what keeps the
  // last-Administrator guard honest about who can still get in.
  const signedInAs =
    me === undefined || me.state === "anonymous"
      ? null
      : me.state === "unregistered"
        ? "new"
        : me.state === "ineligible"
          ? `ineligible:${me.email ?? ""}`
          : me.account.id;
  // A failed call would otherwise leave nothing to change `signedInAs` — a
  // failed create keeps `me` unregistered and the pending screen up; a failed
  // refresh of a refused identity keeps the guard counting a stale address —
  // so a failure re-arms this effect, a few times. The one refusal that is by
  // design (an ineligible identity with no row) exhausts the same small
  // budget and then stops, which costs three calls and nothing else.
  const [retry, setRetry] = useState(0);
  const attempts = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` is the re-arm, not an input.
  useEffect(() => {
    if (signedInAs === null) {
      // Signed out, or a session that expired: the next sign-in is a new one,
      // even into the same account, so it gets its own refresh.
      ensuredFor.current = null;
      attempts.current = 0;
      return;
    }
    if (ensuredFor.current === signedInAs) return;
    ensuredFor.current = signedInAs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    ensureUser({}).then(
      (userId) => {
        attempts.current = 0;
        ensuredFor.current = userId ?? signedInAs;
      },
      () => {
        // Nothing here is worth a toast on a blank page.
        attempts.current += 1;
        if (attempts.current >= ENSURE_RETRY_LIMIT) return;
        ensuredFor.current = null;
        timer = setTimeout(() => setRetry((count) => count + 1), ENSURE_RETRY_MS);
      },
    );
    return () => clearTimeout(timer);
  }, [signedInAs, ensureUser, retry]);

  useRememberLocation();

  // Google sends the browser back here; Clerk finishes and moves it along.
  if (isSsoCallback()) return <SsoCallback />;

  if (ending === "expired") return <SessionExpiredScreen />;
  if (isLoading || me === undefined) return <AuthPending />;

  switch (me.state) {
    case "anonymous":
      return <SignInScreen signedOut={ending === "signedOut"} />;
    // A verified token whose User record is still being created.
    case "unregistered":
      return <AuthPending />;
    // A verified token the deployment's email-domain gate does not admit. No
    // User row exists, `ensureUser` would be refused, and there is nothing to
    // wait for — only a way back out.
    case "ineligible":
      return <IneligibleScreen email={me.email} />;
    case "deactivated":
      return <DeactivatedScreen email={me.account.email} />;
    case "active":
      // A Member with no Access Assignments has nothing to render yet — an
      // Administrator's grant is the next step, not a bug.
      if (me.account.role === "member" && me.scopes.length === 0) {
        return <NoAccessScreen email={me.account.email} />;
      }
      return <ViewerContext.Provider value={me}>{children}</ViewerContext.Provider>;
  }
}
