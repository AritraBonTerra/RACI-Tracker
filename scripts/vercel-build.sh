#!/usr/bin/env bash
# Vercel runs this for every deployment; what it does depends on the target.
#
# Production is the real release path: deploy the Convex backend first, then
# build the frontend against it (the standard Convex+Vercel integration, which
# needs CONVEX_DEPLOY_KEY in Vercel's Production environment). Previews carry
# no deploy key on purpose — a branch push must never touch a Convex
# deployment — so they build the frontend alone, against whatever
# VITE_CONVEX_URL / VITE_CLERK_PUBLISHABLE_KEY the Preview environment
# provides (the dev stack, making preview URLs actually signable-into).
set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  bunx convex deploy --cmd 'bun run build'
else
  bun run build
fi
