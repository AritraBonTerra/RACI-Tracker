import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
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
  const signedInAs =
    me === undefined || me.state === "anonymous" || me.state === "ineligible"
      ? null
      : me.state === "unregistered"
        ? "new"
        : me.account.id;
  useEffect(() => {
    if (signedInAs === null || ensuredFor.current === signedInAs) return;
    ensuredFor.current = signedInAs;
    ensureUser({}).then(
      (userId) => {
        ensuredFor.current = userId;
      },
      () => {
        // A failed create leaves `me` unregistered and the pending screen up;
        // reloading retries. Nothing here is worth a toast on a blank page.
        ensuredFor.current = null;
      },
    );
  }, [signedInAs, ensureUser]);

  const active = me?.state === "active";
  useRememberLocation(active);

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
