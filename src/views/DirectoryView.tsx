import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Breadcrumb, PageHeader, PanelSkeleton } from "../components/page";
import {
  Button,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  Panel,
  Pill,
  Skeleton,
  inputClass,
} from "../components/ui";
import { formatStamp } from "../lib/dates";
import { useReportedMutation } from "../lib/toast";

// The Directory (#34): people-first access administration. The roster on the
// left says who needs attention; picking a row puts that account's whole story
// in one pane — identity, the Person carrying their RACI history, their role,
// their grants with an effective-access preview, and offboarding. The audit
// feed runs underneath all of it.
//
// None of this is protection. Every button here calls a function that re-checks
// the Administrator role server-side, the last-Administrator guard is enforced
// there too, and a Member who forced this screen open would get a page of
// refusals rather than a way in. What the UI owes the Administrator is that the
// refusal is never a surprise — so the guard is *explained* before it is hit.

type Roster = FunctionReturnType<typeof api.directory.roster>;
type Account = Roster["accounts"][number];
type Detail = NonNullable<FunctionReturnType<typeof api.directory.account>>;
type Scope = Detail["grants"][number]["scope"];
type AccessTree = FunctionReturnType<typeof api.directory.effectiveAccess>;

export function DirectoryView() {
  const roster = useQuery(api.directory.roster, {});
  const [selectedId, setSelectedId] = useState<Id<"users"> | null>(null);
  const [granting, setGranting] = useState<Id<"users"> | null>(null);

  // The roster is ordered so the top row is the one that needs doing next, so
  // it is also the one that opens — but only once. The order changes as work is
  // done on it (a grant empties the queue, a deactivation sinks a row), and a
  // pane that kept following row one would walk away mid-task.
  const selected =
    roster?.accounts.find((account) => account.userId === selectedId) ??
    roster?.accounts[0];
  useEffect(() => {
    if (selectedId === null && selected !== undefined) setSelectedId(selected.userId);
  }, [selectedId, selected]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={<Breadcrumb trail={[{ label: "Directory" }]} />}
        title="Access"
        meta={
          <>
            <span className="text-ink-500">
              Who can sign in, what they can see, and every change made to that.
            </span>
            {roster !== undefined && roster.awaitingCount > 0 && (
              <Pill className="bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40 ring-inset">
                {roster.awaitingCount} awaiting access
              </Pill>
            )}
            {roster !== undefined && roster.activeAdministrators === 1 && (
              <span className="text-amber-300">
                One active Administrator — promote a second before anyone goes on
                leave.
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
        <Panel title="Accounts" subtitle="Everyone who has signed in">
          {roster === undefined ? (
            <PanelSkeleton rows={5} />
          ) : (
            <ul className="divide-y divide-ink-800/70">
              {roster.accounts.map((account) => (
                <li key={account.userId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(account.userId)}
                    className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition ${
                      account.userId === selected?.userId
                        ? "bg-ink-800/70"
                        : "hover:bg-ink-800/40"
                    }`}
                  >
                    <span
                      className={`truncate text-sm ${
                        account.isActive ? "text-ink-100" : "text-ink-500 line-through"
                      }`}
                    >
                      {account.name}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <SignalPills account={account} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {selected === undefined ? (
          <Panel title="Account">
            <EmptyState title="Nobody has signed in yet">
              A User is created the first time someone signs in with their Microsoft
              account — they are never pre-provisioned.
            </EmptyState>
          </Panel>
        ) : (
          <AccountPane
            userId={selected.userId}
            onGrant={() => setGranting(selected.userId)}
          />
        )}
      </div>

      <ActivityPanel />

      {granting !== null && (
        <GrantModal userId={granting} onClose={() => setGranting(null)} />
      )}
    </div>
  );
}

/**
 * The state of an account at a glance. Only the ones worth reacting to: the
 * queue, the offboarded, the missing Person link, and the role that reaches
 * everything.
 */
function SignalPills({ account }: { account: Account }) {
  if (!account.isActive) {
    return (
      <Pill className="bg-ink-800 text-ink-500 ring-1 ring-ink-700 ring-inset">
        Deactivated
      </Pill>
    );
  }
  return (
    <>
      {account.role === "administrator" && (
        <Pill className="bg-sand-400/15 text-sand-300 ring-1 ring-sand-500/40 ring-inset">
          Administrator
        </Pill>
      )}
      {account.awaitingAccess && (
        <Pill className="bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40 ring-inset">
          Awaiting access
        </Pill>
      )}
      {account.person === null && (
        <Pill className="bg-ink-800 text-ink-400 ring-1 ring-ink-700 ring-inset">
          No linked Person
        </Pill>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-2xs font-semibold tracking-wide text-ink-400 uppercase">
      {children}
    </p>
  );
}

/** Everything an Administrator does to one account, in the order they do it. */
function AccountPane({
  userId,
  onGrant,
}: {
  userId: Id<"users">;
  onGrant: () => void;
}) {
  const detail = useQuery(api.directory.account, { userId });

  if (detail === undefined) {
    return (
      <Panel title="Account">
        <PanelSkeleton rows={6} />
      </Panel>
    );
  }
  if (detail === null) {
    return (
      <Panel title="Account">
        <EmptyState title="This account no longer exists">
          It was removed while this page was open. Pick another row.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel title={detail.name}>
      <div className="flex flex-col gap-5 px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-xs text-ink-400">{detail.email ?? "No email claim"}</span>
          <span className="text-2xs text-ink-600">
            · first signed in {formatStamp(detail.firstSignInAt)} · last{" "}
            {formatStamp(detail.lastSignInAt)}
          </span>
          <SignalPills account={detail} />
        </div>

        <PersonLink detail={detail} />
        <RoleSection detail={detail} />
        {/* An Administrator's grants are dormant, not gone — a promoted Member
            gets them back on demotion, so they stay on screen. */}
        {(detail.role === "member" || detail.grants.length > 0) && (
          <GrantsSection detail={detail} onGrant={onGrant} />
        )}

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Effective access</SectionLabel>
          <AccessTreeView userId={detail.userId} />
          {detail.role === "administrator" && (
            <p className="text-3xs text-ink-600">
              An Administrator reaches everything by role, not by grant.
            </p>
          )}
          {!detail.isActive && (
            <p className="text-3xs text-ink-600">
              Inert while deactivated — this is what reactivation hands back.
            </p>
          )}
        </div>

        <AccountHistory userId={detail.userId} />

        <Offboarding detail={detail} />
      </div>
    </Panel>
  );
}

/**
 * What has been done to this account, in the pane where it is being done. The
 * same audit feed as the whole-company one at the bottom of the page, filtered
 * to one subject — an Administrator about to change a role should be able to
 * see the last one without reading past everybody else's week.
 */
function AccountHistory({ userId }: { userId: Id<"users"> }) {
  const feed = useQuery(api.directory.auditFeed, { userId, limit: 8 });

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>History</SectionLabel>
      {feed === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : feed.length === 0 ? (
        <p className="text-xs text-ink-500">Nothing recorded for this account yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {feed.map((event) => (
            <li key={event.id} className="text-3xs text-ink-500">
              <span className="text-ink-300">
                {ACTION_VERB[event.action]}
                {event.detail === undefined ? "" : ` (${event.detail})`}
              </span>{" "}
              · {event.actorName ?? "Deploy credentials"} · {formatStamp(event.at)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The link to the Person carrying this employee's RACI history. Orientation,
 * never access: linking grants nothing, and the candidates are internal People
 * only, because a Distributor or Buyer contact never has a sign-in.
 */
function PersonLink({ detail }: { detail: Detail }) {
  const link = useReportedMutation(api.directory.linkPerson);

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Linked Person</SectionLabel>
      {detail.person !== null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-200">{detail.person.name}</span>
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              void link({ userId: detail.userId, personId: null })
            }
          >
            Unlink
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-500">
            Not linked. Linking connects this sign-in to the Person carrying RACI
            history — it grants nothing.
          </p>
          {detail.candidates.map((candidate) => (
            <div
              key={candidate.personId}
              className="flex items-center justify-between gap-2 rounded-md border border-ink-800 bg-ink-950/60 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs text-ink-200">
                <span className="truncate">{candidate.name}</span>
                <span className="text-ink-500">
                  {" · "}
                  {candidate.functionName}
                  {candidate.title === undefined ? "" : ` · ${candidate.title}`}
                  {candidate.reason === "email" ? " · same email address" : ""}
                </span>
              </span>
              <Button
                size="xs"
                onClick={() =>
                  void link({ userId: detail.userId, personId: candidate.personId })
                }
              >
                Link
              </Button>
            </div>
          ))}
          <p className="text-3xs text-ink-600">
            {detail.candidates.length === 0
              ? "No internal Person matches this account. Create one in Manage first."
              : "None of these? Leave unlinked and create a Person in Manage first."}
          </p>
        </>
      )}
    </div>
  );
}

function RoleSection({ detail }: { detail: Detail }) {
  const setRole = useReportedMutation(api.directory.setRole);
  const locked = detail.isLastActiveAdministrator;
  const next = detail.role === "administrator" ? "member" : "administrator";

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Role</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-200">
          {detail.role === "administrator"
            ? "Administrator — reaches and manages everything"
            : "Member — sees granted scopes only"}
        </span>
        {detail.isActive && (
          <Button
            size="xs"
            disabled={locked}
            title={
              locked ? "The last active Administrator can't be demoted" : undefined
            }
            onClick={() => void setRole({ userId: detail.userId, role: next })}
          >
            {next === "member" ? "Make Member" : "Make Administrator"}
          </Button>
        )}
      </div>
      {locked && (
        <p className="text-3xs text-rose-300">
          This is the last active Administrator — promote someone else before demoting
          or deactivating this account. The server refuses either way.
        </p>
      )}
    </div>
  );
}

function GrantsSection({ detail, onGrant }: { detail: Detail; onGrant: () => void }) {
  const revoke = useReportedMutation(api.directory.revoke);

  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Access grants</SectionLabel>
      {detail.role === "administrator" && (
        <p className="text-3xs text-ink-600">
          Dormant behind the Administrator role. Demoting this account hands them
          back exactly as they are.
        </p>
      )}
      {detail.grants.length === 0 ? (
        <p className="text-xs text-ink-500">
          No access granted yet — this account is on the “access comes next” screen.
        </p>
      ) : (
        detail.grants.map((grant) => (
          <div
            key={keyOf(grant.scope)}
            className="flex items-center justify-between gap-2 rounded-md border border-ink-800 bg-ink-950/60 px-2.5 py-1.5"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs text-ink-200">{grant.label}</span>
              <span className="block text-3xs text-ink-500">
                by {grant.grantedByName ?? "deploy credentials"} ·{" "}
                {formatStamp(grant.grantedAt)}
              </span>
            </span>
            <ConfirmButton
              label="Revoke"
              confirmLabel="Revoke now"
              onConfirm={() =>
                void revoke({ userId: detail.userId, scope: grant.scope })
              }
            />
          </div>
        ))
      )}
      {/* An Administrator already reaches everything, so the server refuses to
          give them a grant. No button for a refusal. */}
      {detail.role === "member" && (
        <Button size="xs" variant="ghost" className="self-start" onClick={onGrant}>
          + Grant access
        </Button>
      )}
    </div>
  );
}

/**
 * Offboarding. Deactivation denies the account's very next call — there is no
 * session to wait out — and leaves role and grants alone, so reactivation is
 * one button rather than a reconstruction.
 */
function Offboarding({ detail }: { detail: Detail }) {
  const setActive = useReportedMutation(api.directory.setActive);

  return (
    <div className="flex flex-col gap-1.5 border-t border-ink-800 pt-4">
      {detail.isActive ? (
        <>
          <ConfirmButton
            label="Deactivate account"
            confirmLabel="Deactivate now"
            size="sm"
            className="self-start"
            // Same guard the demote button carries and the server enforces:
            // arming a button that can only end in a toast is a worse way to
            // learn the rule than reading it here.
            disabledReason={
              detail.isLastActiveAdministrator
                ? "The last active Administrator can't be deactivated"
                : undefined
            }
            onConfirm={() =>
              void setActive({ userId: detail.userId, isActive: false })
            }
          />
          <p className="text-3xs text-ink-600">
            Denies everything immediately, server-side. Pair it with disabling the
            account in Entra; RACI history stays on the linked Person.
          </p>
        </>
      ) : (
        <>
          <Button
            size="sm"
            className="self-start"
            onClick={() => void setActive({ userId: detail.userId, isActive: true })}
          >
            Reactivate account
          </Button>
          <p className="text-3xs text-ink-600">
            Restores exactly the role and grants above.
          </p>
        </>
      )}
    </div>
  );
}

// --- The effective-access tree --------------------------------------------

const REACH_ROW = {
  full: "text-ink-100",
  context: "text-ink-500",
  none: "text-ink-700",
} as const;

const REACH_TAG = {
  full: { label: "full", className: "text-sand-300" },
  context: { label: "label only", className: "text-ink-500" },
  none: { label: "hidden", className: "text-ink-700" },
} as const;

function ReachRow({
  label,
  reach,
  indent = 0,
}: {
  label: string;
  reach: keyof typeof REACH_ROW;
  indent?: number;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-xs ${REACH_ROW[reach]} ${
        indent === 1 ? "ml-3" : indent === 2 ? "ml-6" : ""
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className={`shrink-0 text-2xs ${REACH_TAG[reach].className}`}>
        {REACH_TAG[reach].label}
      </span>
    </div>
  );
}

/** The union an account sees, as the tree it unlocks. */
function AccessTreeView({
  userId,
  adding,
}: {
  userId: Id<"users">;
  /** A grant not yet made: this is what turns the tree into a preview. */
  adding?: Scope;
}) {
  const tree = useQuery(api.directory.effectiveAccess, {
    userId,
    ...(adding === undefined ? {} : { adding }),
  });
  if (tree === undefined) return <Skeleton className="h-24 w-full" />;
  return <AccessTreeBody tree={tree} />;
}

function AccessTreeBody({ tree }: { tree: AccessTree }) {
  if (tree.length === 0) {
    return (
      <p className="text-xs text-ink-500">
        No plan years yet — there is nothing to grant access to.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-ink-800 bg-ink-950/60 px-3 py-2">
      {tree.map((year) => (
        <div key={year.seasonId} className="flex flex-col gap-1">
          <ReachRow label={year.label} reach={year.reach} />
          {year.plans.map((plan) => (
            <div key={plan.chainPlanId} className="flex flex-col gap-1">
              <ReachRow label={plan.label} reach={plan.reach} indent={1} />
              {plan.promotions.map((promotion) => (
                <ReachRow
                  key={promotion.promotionId}
                  label={promotion.label}
                  reach={promotion.reach}
                  indent={2}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Granting -------------------------------------------------------------

/**
 * Pick a scope, see what it unlocks, then grant. The preview is the point: a
 * Plan Year grant and a Promotion grant look the same in a dropdown and are
 * nothing alike in what they open, so the tree answers before anyone confirms.
 */
function GrantModal({ userId, onClose }: { userId: Id<"users">; onClose: () => void }) {
  const tree = useQuery(api.directory.effectiveAccess, { userId });
  const grant = useReportedMutation(api.directory.grant);
  const [choice, setChoice] = useState("");

  const options = tree === undefined ? [] : scopeOptions(tree);
  // Default to the first thing in the hierarchy rather than to nothing, so the
  // preview has something to say the moment the modal opens.
  const selected = options.find((option) => option.key === choice) ?? options[0];

  return (
    <Modal
      title="Grant access"
      onClose={onClose}
      footer={
        <>
          <Button size="md" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="md"
            variant="primary"
            disabled={selected === undefined}
            onClick={async () => {
              if (selected === undefined) return;
              const result = await grant({ userId, scope: selected.scope });
              if (result.ok) onClose();
            }}
          >
            Grant access
          </Button>
        </>
      }
    >
      {tree === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : options.length === 0 ? (
        <p className="text-sm text-ink-400">
          There are no plan years, chain plans or promotions to grant yet.
        </p>
      ) : (
        <>
          <Field
            label="Scope"
            hint="Access flows down: a chain plan includes its promotions, the plan year includes everything."
          >
            <select
              value={selected?.key ?? ""}
              onChange={(event) => setChoice(event.target.value)}
              className={inputClass}
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="They will see" hint="The union of every grant, after this one.">
            {selected === undefined ? (
              <span />
            ) : (
              <AccessTreeView userId={userId} adding={selected.scope} />
            )}
          </Field>
        </>
      )}
    </Modal>
  );
}

// A `<select>` collapses ordinary leading spaces, so the tiers are stepped in
// with non-breaking ones — the picker is a hierarchy, and a flat list of names
// makes "Kroger" and "Kroger's Holiday Endcap" look like peers.
const STEP = "   ";

/** Every grantable scope, flattened into the picker, indented by tier. */
function scopeOptions(tree: AccessTree) {
  return tree.flatMap((year) => [
    { key: year.seasonId, label: year.label, scope: scopeOf(year) },
    ...year.plans.flatMap((plan) => [
      { key: plan.chainPlanId, label: `${STEP}${plan.label} plan`, scope: scopeOf(plan) },
      ...plan.promotions.map((promotion) => ({
        key: promotion.promotionId,
        label: `${STEP}${STEP}${promotion.label}`,
        scope: scopeOf(promotion),
      })),
    ]),
  ]);
}

/** The scope a tree node stands for, read off whichever id it carries. */
function scopeOf(
  node:
    | { seasonId: Id<"seasons"> }
    | { chainPlanId: Id<"chainPlans"> }
    | { promotionId: Id<"promotions"> },
): Scope {
  if ("seasonId" in node) return { tier: "season", seasonId: node.seasonId };
  if ("chainPlanId" in node) return { tier: "chainPlan", chainPlanId: node.chainPlanId };
  return { tier: "promotion", promotionId: node.promotionId };
}

/** The id inside a scope, which is the one thing that makes it unique. */
function keyOf(scope: Scope): string {
  return scope.tier === "season"
    ? scope.seasonId
    : scope.tier === "chainPlan"
      ? scope.chainPlanId
      : scope.promotionId;
}

// --- The audit feed -------------------------------------------------------

/** What each audited action reads as, in the feed's own voice. */
const ACTION_VERB: Record<
  FunctionReturnType<typeof api.directory.auditFeed>[number]["action"],
  string
> = {
  user_created: "signed in for the first time",
  role_changed: "role changed",
  user_activated: "reactivated",
  user_deactivated: "deactivated",
  person_linked: "Person link changed",
  access_granted: "access granted",
  access_revoked: "access revoked",
};

function ActivityPanel() {
  const feed = useQuery(api.directory.auditFeed, { limit: 40 });

  return (
    <Panel title="Activity" subtitle="Every access-management action, kept indefinitely">
      {feed === undefined ? (
        <PanelSkeleton rows={4} />
      ) : feed.length === 0 ? (
        <EmptyState title="Nothing yet">
          Role changes, grants, revocations, offboarding and Person links land here
          with who did them and when.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-ink-800/70">
          {feed.map((event) => (
            <li key={event.id} className="px-4 py-2">
              <p className="text-xs text-ink-300">
                {event.subjectName} — {ACTION_VERB[event.action]}
                {event.detail === undefined ? "" : ` (${event.detail})`}
              </p>
              <p className="text-3xs text-ink-600">
                {event.actorName ?? "Deploy credentials"} · {formatStamp(event.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
