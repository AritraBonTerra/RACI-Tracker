import { adminMutation, adminQuery, authedMutation, authedQuery } from "./access";

// Four functions that exist only to be refused. The wrappers in `access.ts` are
// the whole authorization architecture, but no module uses them yet (every
// pre-existing module is on `AWAITING_MIGRATION`), so without this file a
// regression in `requireViewer` — dropping the deactivated check, returning
// null instead of denying — would break the boundary with a green suite.
//
// These are the thinnest possible modules-under-a-wrapper: each returns the
// role of the viewer the wrapper injected, so a test can tell "let through"
// from "refused" and nothing else is being asserted along the way.
//
// The second dot in the filename is load-bearing. Convex's bundler skips every
// entry point whose basename carries more than one dot, so this module is never
// deployed and never appears in `api` — it is reachable only from `convex-test`,
// which loads modules straight off disk.

export const viewerRole = authedQuery({
  args: {},
  handler: (ctx) => ctx.viewer.role,
});

export const administratorRole = adminQuery({
  args: {},
  handler: (ctx) => ctx.viewer.role,
});

export const writeAsViewer = authedMutation({
  args: {},
  handler: (ctx) => ctx.viewer.role,
});

export const writeAsAdministrator = adminMutation({
  args: {},
  handler: (ctx) => ctx.viewer.role,
});
