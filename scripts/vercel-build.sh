#!/usr/bin/env bash
# Only production and the staging branch deploy backend code. Other previews
# build the frontend against their configured backend without changing it.
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  : "${CONVEX_DEPLOY_KEY:?Set the production Convex deploy key in Vercel Production}"
  bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
elif [ "${VERCEL_ENV:-}" = "preview" ] && [ "${VERCEL_GIT_COMMIT_REF:-}" = "staging" ]; then
  : "${CONVEX_DEPLOY_KEY:?Set a staging-only Convex deploy key for the staging branch}"
  bunx convex deploy --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
else
  bun run build
fi
