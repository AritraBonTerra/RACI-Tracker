import { adminMutation, adminQuery, authedMutation, authedQuery } from "./access";

// Four functions that exist only to be refused. Every real module is behind a
// wrapper now (#33), but each of them also validates arguments, loads records
// and checks scope — so a test that a refusal happened against, say,
// `promotions.update` is a test of four things at once.
//
// These are the thinnest possible modules-under-a-wrapper: each returns the
// role of the viewer the wrapper injected and does nothing else, so a
// regression in `requireViewer` — dropping the deactivated check, returning
// null instead of denying — is caught here with nothing else in the frame.
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
