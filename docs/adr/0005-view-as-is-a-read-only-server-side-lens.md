# 5. "View as" is a read-only lens resolved server-side

Date: 2026-09-15

## Status

Accepted.

## Context

Administrators kept asking "what does Marcus actually see?" The Directory's
effective-access tree answers which records a grant reaches, but not what the
app looks like from inside it: which years the dropdown lists, whether the
dashboard or a single promotion opens, which buttons an Editor has that a
Viewer does not. The alternative was borrowing someone's sign-in, which is
the one thing an access model must never make the convenient option.

Three shapes were considered.

- **Client-only.** The shell pretends to be a lower role. Rejected: the
  backend still answers for the Administrator, so every scoped list is wrong
  and the preview lies about exactly the thing it is for.
- **A `viewAs` argument on every query.** Correct, but it threads one more
  argument through every function and every `useQuery`, and one forgotten
  call site is a page that quietly shows the Administrator's world.
- **A pointer on the Administrator's own row, read by the wrappers.** One
  write, and every open subscription re-evaluates because every wrapper reads
  that row already.

## Decision

`users.viewingAs` holds the account an Administrator is looking through. The
wrappers in `convex/access.ts` resolve the caller, then swap in that account
as `viewer` with its own scope, so a handler cannot tell a lens from a real
sign-in and the answer is the same code path, not a second implementation.

Rules that follow:

- **Read-only.** `authedMutation` refuses every write while the lens is on,
  with a sentence that says so. Nothing is ever stamped or audited through
  someone else's account, and the Administrator does not need write access
  through the lens because they have it as themselves.
- **The Administrator's surfaces close.** `adminQuery` and `adminMutation`
  judge the account being viewed as, so the Directory and Manage vanish
  exactly as they would for that person. Only `viewAs` and `stopViewingAs`
  answer to the account behind the lens, which is what makes the way back.
- **Only Editors and Viewers who can sign in** can be viewed as. Another
  Administrator sees what you see; a deactivated or gated account sees
  nothing. The Directory offers the button on the same predicate the server
  enforces (`viewableAs`).
- **A stale pointer is ignored, not honoured.** If the account is deactivated
  or promoted underneath the lens, the Administrator is themselves again on
  the next call. Demotion drops the holder's lens outright.
- **Not audited.** No new access is granted or used — the Administrator
  already reaches everything the lens shows less of — so an audit event would
  record nothing the trail is for.

## Consequences

- Every existing query, the navigation tree, the landing redirect and the
  Account menu's "what do I have?" answer through the lens with no changes to
  them. `convex/viewAs.test.ts` asserts byte-for-byte equality against the
  account's own answers.
- The lens is per account, not per tab: an Administrator with two windows
  open sees the same world in both, and putting it down in one puts it down
  everywhere.
- An Editor's edit controls still render through the lens, because that is
  what the Editor sees; using one produces the refusal toast. If that proves
  annoying in practice, the shell can grey them out from `useViewingAs`
  without touching the server rule.
