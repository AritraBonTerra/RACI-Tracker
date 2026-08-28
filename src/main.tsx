import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { AuthUnconfigured } from "./components/AuthScreens";
import { CLERK_PUBLISHABLE_KEY, SIGN_IN } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import "./index.css";

// Provider order matters: Clerk mints the token, `ConvexProviderWithClerk`
// hands it to Convex and re-authenticates on refresh, and only then does
// anything render that could ask a question of the backend.

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const root = createRoot(document.getElementById("root")!);

if (SIGN_IN.kind === "unconfigured") {
  // Two ways a build can be wrong about sign-in, and neither may render a door.
  // Without a key `ClerkProvider` throws on mount, which reads as a white
  // screen; with a production key and no enterprise domain the button would
  // open Clerk's development widget against a tenant that refuses it. A missing
  // environment variable deserves a sentence, and nothing else.
  root.render(
    <StrictMode>
      <AuthUnconfigured missing={SIGN_IN.missing} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
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
