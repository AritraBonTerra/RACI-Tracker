import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { AuthUnconfigured } from "./components/AuthScreens";
import { SIGN_IN } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import "./index.css";

// Provider order matters: Clerk mints the token, `ConvexProviderWithClerk`
// hands it to Convex and re-authenticates on refresh, and only then does
// anything render that could ask a question of the backend.

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const root = createRoot(document.getElementById("root")!);

if (SIGN_IN.kind === "unconfigured") {
  // Without a publishable key `ClerkProvider` throws on mount, which reads as a
  // white screen. A missing environment variable deserves a sentence, and
  // nothing else.
  root.render(
    <StrictMode>
      <AuthUnconfigured missing={SIGN_IN.missing} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      {/* The key `signInConfig` approved, not the raw environment value: the
          two differ by a stray space, and Clerk throws on the latter.

          `signInUrl` is set so Clerk derives the Google round trip's return
          path from this app rather than from the hosted account portal —
          `/sign-in/sso-callback`, which `isSsoCallback` matches by suffix. */}
      <ClerkProvider
        publishableKey={SIGN_IN.publishableKey}
        signInUrl="/sign-in"
        afterSignOutUrl="/"
      >
        <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
          <ToastProvider>
            <AuthGate>
              <App />
            </AuthGate>
          </ToastProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </StrictMode>,
  );
}
