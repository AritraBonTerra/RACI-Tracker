// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

test("only production and staging builds deploy the backend, and both require a key", () => {
  const dir = mkdtempSync(join(tmpdir(), "raci-build-"));
  try {
    for (const tool of ["bun", "bunx"]) {
      writeFileSync(join(dir, tool), `#!/bin/sh\nprintf '%s\\n' '${tool}' "$@"\n`, { mode: 0o700 });
    }
    const env = {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      CONVEX_DEPLOY_KEY: "test-key",
    };
    for (const [target, branch, deploys] of [
      ["production", "main", true],
      ["preview", "staging", true],
      ["preview", "feature", false],
      ["development", "staging", false],
    ] as const) {
      const selected = { ...env, VERCEL_ENV: target, VERCEL_GIT_COMMIT_REF: branch };
      const output = execFileSync("bash", ["scripts/vercel-build.sh"], {
        env: selected,
        encoding: "utf8",
      });
      expect(output.startsWith("bunx\nconvex\ndeploy\n")).toBe(deploys);
      if (deploys) {
        expect(output).toContain("VITE_CONVEX_URL");
        expect(
          spawnSync("bash", ["scripts/vercel-build.sh"], {
            env: { ...selected, CONVEX_DEPLOY_KEY: "" },
            encoding: "utf8",
          }).status,
        ).not.toBe(0);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
