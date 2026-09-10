# Development, staging and production

| Environment | Backend | Release path |
| --- | --- | --- |
| Local development | `http://127.0.0.1:3210` | `bun run convex` and `bun run dev` |
| Staging | `flippant-jaguar-524`, reference `staging` | Push to the `staging` branch |
| Production | Existing default production deployment | Merge reviewed changes into `main` |

Each backend has its own database, functions, files, environment variables and
access assignments. Local and staging were initialized with sample data, not a
copy of production. Sign in and bootstrap an Administrator separately in each
new environment using the access-administration runbook.

## Local development

This worktree's ignored `.env.local` selects the local backend and the existing
Clerk development instance. Run `bun run convex` in one terminal and `bun run dev`
in another. The local backend must be running for the app to work. Its data
persists on this computer between runs.

The previous cloud development deployment, `posh-mule-710`, is preserved.
Other worktrees do not automatically switch to local development. To configure
one, use `bunx convex deployment select aritra-das-44117:raci-tracker:local`, or
create it with `bunx convex deployment create aritra-das-44117:raci-tracker:local --select`
if it does not exist.

## Staging

Staging is a persistent Convex deployment with type `prod` and reference
`staging`. That type gives it production-like behavior; it is not the default
production deployment and it does not share production data.

Vercel Preview variables scoped specifically to Git branch `staging`:

- `CONVEX_DEPLOY_KEY`: the staging-only deploy key.
- `VITE_CONVEX_URL`: `https://flippant-jaguar-524.convex.cloud`.
- `VITE_CLERK_PUBLISHABLE_KEY`: the Clerk development instance key.

The staging backend's `CLERK_JWT_ISSUER_DOMAIN` matches that Clerk instance.
The optional `ALLOWED_EMAIL_DOMAIN` gate is currently unset, matching the prior
development environment. App access still requires explicit grants.

`scripts/vercel-build.sh` deploys the backend only for Production builds or
Preview builds from `staging`. Convex supplies the matching backend URL during
the frontend build. Other feature previews keep their configured backend and do
not deploy backend code. They are not independent backend environments.

For a manual staging deployment from this worktree:

```sh
bunx convex deploy --env-file .env.staging.local --cmd 'bun run build' --cmd-url-env-var-name VITE_CONVEX_URL
```

`.env.staging.local` is ignored and contains a staging-only credential. Do not
commit it. On another machine, create a separate key scoped to staging or use
the Vercel branch deployment. Never use the production key for staging.

## Promoting a release

Test locally, push the candidate code to `staging`, gather feedback, then merge
the approved code into `main`. Promote code, not the staging database. Changes
users make in production stay in production. Schema changes still need to be
compatible with existing production records.

Convex supports multiple deployments within one project. See the
[deployment guide](https://docs.convex.dev/production/multiple-deployments).
