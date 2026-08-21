# RACI Tracker

Promotion tracking for chain retail — who owns what (RACI) across the
Season → Chain Plan → Promotion lifecycle.

## Stack

- [Convex](https://convex.dev) — backend (database, queries, mutations), deployed to Convex Cloud
- React 19 + [Vite](https://vite.dev) — frontend, deployed to Vercel
- [Tailwind CSS v4](https://tailwindcss.com) — styling
- [bun](https://bun.sh) — package manager and script runner

## Development

```sh
bun install
bun run convex   # Convex dev server: pushes functions on change, writes .env.local
bun run dev      # Vite dev server (separate terminal)
```

`bun run build` type-checks and builds the frontend into `dist/`.

## Deployment

- **Backend**: `bunx convex deploy` pushes functions to the production Convex deployment.
- **Frontend**: Vercel builds via `vercel.json`, which runs `convex deploy --cmd 'bun run build'`
  so every Vercel deploy ships the matching backend. Requires a `CONVEX_DEPLOY_KEY`
  (production) environment variable in the Vercel project; `VITE_CONVEX_URL` is injected
  automatically during the build.
