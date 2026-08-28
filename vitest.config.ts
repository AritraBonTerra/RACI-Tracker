import { defineConfig } from "vitest/config";

// Tests run against the public Convex function surface via `convex-test`, which
// needs the Convex runtime's edge-like environment. The access-boundary test
// opts out with a `@vitest-environment node` docblock because it reads source
// files off disk.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
