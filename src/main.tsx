import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import { AuthUnconfigured } from "./components/AuthScreens";
import { CLERK_PUBLISHABLE_KEY } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import "./index.css";

// Provider order matters: Clerk mints the token, `ConvexProviderWithClerk`
// hands it to Convex and re-authenticates on refresh, and only then does
// anything render that could ask a question of the backend.

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

const root = createRoot(document.getElementById("root")!);

if (!CLERK_PUBLISHABLE_KEY) {
  // Without a key `ClerkProvider` throws on mount, which reads as a white
  // screen. A missing environment variable deserves a sentence.
  root.render(
    <StrictMode>
      <AuthUnconfigured />
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
