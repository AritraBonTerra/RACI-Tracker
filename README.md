# RACI Tracker

Promotion tracking for chain retail — who owns what (RACI) across the
Season → Chain Plan → Promotion lifecycle.

## Stack

- [Convex](https://convex.dev) — backend (database, queries, mutations), deployed to Convex Cloud
- React 19 + [Vite](https://vite.dev) — frontend, deployed to Vercel
- [Tailwind CSS v4](https://tailwindcss.com) — styling
- [Clerk](https://clerk.com) — Microsoft sign-in, via a SAML enterprise connection
  to the company's Entra tenant (see `docs/adr/0002-…`)
- [Vitest](https://vitest.dev) + [convex-test](https://docs.convex.dev/testing/convex-test) — tests
- [bun](https://bun.sh) — package manager and script runner

## Development

```sh
bun install
cp .env.example .env.local   # then fill in VITE_CLERK_PUBLISHABLE_KEY
bun run convex   # Convex dev server: pushes functions on change, writes .env.local
bun run dev      # Vite dev server (separate terminal)
```

Sign-in needs a Clerk development instance and one Convex environment variable.
`docs/runbooks/clerk-setup.md` walks through both, and ends with the
`bunx convex run bootstrap:grantAdmin` call that makes you an Administrator.

`bun run build` type-checks and builds the frontend into `dist/`.

## Tests

```sh
bun run test        # once
bun run test:watch
bun run typecheck
```

Tests call the public Convex function surface through `convex-test`, injecting
a signed-in identity per scenario with `withIdentity` — the same functions the
browser calls, with no deployment involved.

## Access control

Authorization lives in one module, `convex/access.ts`: the `authedQuery` /
`authedMutation` / `adminQuery` / `adminMutation` wrappers, the `ensureUser`
first-sign-in entry point, and the `me` query the shell renders from. No module
outside it may build a public `query` or `mutation`, and
`convex/accessBoundary.test.ts` fails the build if one does. Bootstrap and
break-glass live in `convex/bootstrap.ts` as internal functions, reachable only
with deploy credentials.

## Deployment

- **Backend**: `bunx convex deploy` pushes functions to the production Convex deployment.
- **Frontend**: Vercel builds via `vercel.json`, which runs `convex deploy --cmd 'bun run build'`
  so every Vercel deploy ships the matching backend. Requires a `CONVEX_DEPLOY_KEY`
  (production) environment variable in the Vercel project; `VITE_CONVEX_URL` is injected
  automatically during the build.
