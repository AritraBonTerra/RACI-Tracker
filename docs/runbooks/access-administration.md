# Access administration — the Directory

`#/directory`, Administrators only. Everything about who can sign in, what they
can see, and every change made to that. `docs/runbooks/clerk-setup.md` covers
the identity-provider half; this is the day-to-day surface on top of it.

The page is people-first: a roster on the left, one account's whole story on the
right, the audit feed underneath. The roster is ordered the way the work
arrives — whoever is **awaiting access**, then everyone already working, then
the offboarded — and the Directory's sidebar entry carries the awaiting count so
nobody sits at the "access comes next" screen unnoticed.

## Onboarding someone

1. They sign in with their work address — a verification code by email, or
   Google. That creates their User — active, Member, holding nothing — and lands
   them on "you're signed in, access comes next". Nobody is pre-provisioned;
   only the identity provider can mint an account.
2. Open the Directory. They are at the top of the roster with an **Awaiting
   access** pill.
3. **Link their Person.** The pane suggests internal People matching their
   email address or their name. Linking connects the sign-in to the Person
   carrying their RACI history — it grants nothing. Distributor and Buyer
   People are never offered: an external contact never has a sign-in. If none
   of the candidates is right, create the Person in Manage first and come back.
   The link is one-to-one and Manage refuses to delete a Person who holds one —
   *Unlink* here first, which is recorded like every other access change.
4. **Grant a scope.** *+ Grant access* → pick a Plan Year, Chain Plan or
   Promotion. The tree below the picker shows exactly what they will see before
   you confirm: `full` for what they get, `label only` for the ancestors they
   will see as plain names, `hidden` for everything else.
5. Their open browser tab updates without a reload.

### What an account holds before you grant anything

The waiting-room screen is blank, but the boundary underneath it is not "no
data": a zero-grant account is an ordinary Member, and a Member may read the
**reference data** — People, Functions, Brands and the RACI defaults. That is
deliberate. A task row saying "Alicia" has to be able to say who Alicia is, and
the RACI picker has to offer the whole directory (#27, scenario 17), so the
People roster cannot be scoped without breaking the picker for every Member.

What it means in practice: between a first sign-in and your first grant, that
account can reach the People roster — names, titles, email addresses and
organizations, external Distributor and Buyer contacts included — and nothing
else. No Plan Year, no Chain Plan, no Promotion, no task, no other account's
role or grants. Anyone who completes a sign-in is such an account without an
Administrator lifting a finger — and since 2026-08-28 sign-in refuses nobody
(`docs/adr/0003-…`), that includes a stranger with a personal address. The
`ALLOWED_EMAIL_DOMAIN` gate in `clerk-setup.md` §C is what keeps them from
getting that far; set it, and only verified addresses at the company domain ever
reach the waiting room.

## Grants, in one paragraph

A grant names one Plan Year, Chain Plan or Promotion, and access flows **down**
from it: a Chain Plan grant reaches promotions created under it next month,
because nothing is snapshotted. A Member's access is the **union** of their
grants, so handing out an overlapping second one is harmless and revoking it
takes back only that row. Re-granting the same scope does nothing. A grant
whose target is later deleted stops counting as access — the account drops back
into the awaiting-access queue rather than quietly keeping a dangling pointer.

Administrators reach everything by role, so the Directory refuses to give one a
grant instead of storing a row that means nothing.

## Roles

*Make Administrator* / *Make Member*, from the account pane. Access Assignments
survive both directions: promote a Member and their grants go dormant behind the
Administrator's blanket reach; demote them again and they get back exactly what
they had.

The **last active Administrator cannot be demoted or deactivated.** The button
is disabled with an explanation, and the server refuses regardless — the button
being hidden is a courtesy, not the rule. Keep **two** active Administrators so
that guard never becomes the thing standing between you and a locked deployment.

## Offboarding

*Deactivate account* denies the account's very next call. There is no session to
wait out and nothing cached to expire: every backend function re-reads the flag,
and the browser drops straight to the "this account is deactivated" screen.

Role and grants are left untouched, so *Reactivate account* restores exactly what
they had — no reconstruction, no second grant.

**Always do both sides.** Deactivating here is the immediate local kill switch;
deleting the user in the Clerk dashboard is what stops the identity provider
issuing them a new token at all. Nothing syncs that for you — it is a click a
human makes, and a live session survives until its token expires (~1 hour)
regardless. Local first, Clerk second.

## The audit feed

Every role change, grant, revocation, activation, deactivation and Person-link
change, with its actor and timestamp, kept indefinitely. The whole-company feed
is at the bottom of the page; the account pane's own history is the same feed
filtered to one subject.

Actions taken with deploy credentials — bootstrap, break-glass, CLI grants —
appear as **Deploy credentials**, because an audit trail with a hole where the
first Administrator came from is worse than none.

Ordinary record edits are *not* in here. Those carry a "last edited by" stamp
instead (CONTEXT.md: Last edited); the audit trail covers access only.

## When there is no Administrator to click with

Bootstrap and break-glass are `bunx convex run bootstrap:…`, and they call the
same model the Directory's buttons do. See `docs/runbooks/clerk-setup.md`.

## Human-only steps

Nothing in this document needs an agent, and two things in it cannot be done by
one: the Clerk half of offboarding, and the `ALLOWED_EMAIL_DOMAIN` setting.
Both are in `docs/runbooks/clerk-setup.md`.
