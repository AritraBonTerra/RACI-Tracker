import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";
import {
  isSsoCallback,
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
  const me = useMe();
  const ensureUser = useMutation(api.access.ensureUser);
  const ensured = useRef(false);

  // First sign-in creates the User. Convex has already verified the token by
  // the time this lands, so the record is created from claims, not from
  // anything the browser says about itself.
  const unregistered = me?.state === "unregistered";
  useEffect(() => {
    if (!unregistered || ensured.current) return;
    ensured.current = true;
    void ensureUser({}).catch(() => {
      // A failed create leaves `me` unregistered and the pending screen up;
      // reloading retries. Nothing here is worth a toast on a blank page.
      ensured.current = false;
    });
  }, [unregistered, ensureUser]);

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
