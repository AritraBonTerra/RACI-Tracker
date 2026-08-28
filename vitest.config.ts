import { defineConfig } from "vitest/config";

// Tests run against the public Convex function surface via `convex-test`, which
// needs the Convex runtime's edge-like environment. The tests that read source
// files off disk — the access boundary, the secret scan in `checks/` — opt out
// with a `@vitest-environment node` docblock.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts", "checks/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
