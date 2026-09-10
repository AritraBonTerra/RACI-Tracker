import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "./_generated/dataModel";

// Approved eight-phase activity list supplied on 2026-09-10.
// Department responsibility is guidance, never a named RACI assignment.
// Stored templates are editable in Manage and stamp only newly created work.
type TemplateSeed = Omit<WithoutSystemFields<Doc<"taskTemplates">>, "order">;

export const DEFAULT_TASK_TEMPLATES: readonly TemplateSeed[] = [
  {
    phase: 0,
    name: "Define portfolio strategy : Identify Core priorities, secondary brand priorities, and innovation priorities, SKU Rationalization (where necessary)",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Set annual depletion target",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Confirm annual brand calendar",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Confirm program & local campaign rollout timing",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Confirm innovation launch timing",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Set trade promotional budget",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Set ROI targets",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 0,
    name: "Finalize strategic foundation output",
    spec: "Responsible function: Marketing",
  },
  {
    phase: 1,
    name: "Define account strategy/objectives, consumer profile & account history",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Gather buyer intelligence and priorities",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Align relevant brand plans",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Align shopper marketing programs",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Confirm available investment capacity",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Confirm pricing guardrails against requested programming",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Develop internal JBP brief",
    spec: "Responsible function: Sales",
  },
  {
    phase: 1,
    name: "Approve internal JBP brief",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Align distributor goals to chain volume priorities",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Confirm distributor incentive plan mirrors chain volume priorities",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Confirm buyer-meeting leadership and team",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Check delivery windows and MOQ capability",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Confirm warehouse allocation for new items",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Set incentive structure tied to JBP asks",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Confirm training participation",
    spec: "Responsible function: Sales",
  },
  {
    phase: 2,
    name: "Finalize joint distributor plan and aligned incentive structure",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Prepare prior-year business review: depletions, distribution and share vs. plan",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Prepare category story and segment framing",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Define the ask: new items, shelf placement and pricing",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Define the ask: promo calendar and innovation slotting",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Define the offer: trade spend investment",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Define the offer: shopper program investment",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Conduct structured buyer JBP and negotiation meeting",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Document agreed or provisional terms pending finalization",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Document pricing, spend and program calendar in writing",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Confirm trade spend",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Confirm distributor inventory build, allocations & delivery schedules",
    spec: "Responsible function: Sales",
  },
  {
    phase: 3,
    name: "Finalize signed-off deal terms and distributor incentive program",
    spec: "Responsible function: Sales",
  },
  {
    phase: 4,
    name: "Build POS materials, display units and shelf talkers by program; Align national brand campaigns with chain promo calendar",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Communicate to distributor reps on deal, priorities and incentives",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Confirm store list",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Configure CCM & KARMA for tracking & Communicating program performance internally",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Confirm ETA and delivery destination for activation materials",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Confirm sales rep training plan",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 4,
    name: "Finalize activation kit, synced calendar and field briefing",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Track sell-in of new items by store count and CWD%",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Execute display builds",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Check shelf compliance",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Check shelf price integrity",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Execute features, ads and displays on agreed schedule",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Use KARMA surveys to capture photo audits and visit reports",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 5,
    name: "Finalize store-level execution data",
    spec: "Responsible function: Customer Marketing",
  },
  {
    phase: 6,
    name: "Track depletions, distribution & scan sales (where applicable)",
    spec: "Responsible function: Finance",
  },
  {
    phase: 6,
    name: "Analyze trade spend and promotional lift / ROI vs expected KPIs",
    spec: "Responsible function: Finance",
  },
  {
    phase: 6,
    name: "Capture baseline, promotional-period and uplift measures",
    spec: "Responsible function: Finance",
  },
  {
    phase: 6,
    name: "Track $ / store / week over program period (assess 60 days prior & 60 days following)",
    spec: "Responsible function: Finance",
  },
  {
    phase: 6,
    name: "Track investment",
    spec: "Responsible function: Finance",
  },
  {
    phase: 6,
    name: "Finalize performance dashboard for Phase 7 review",
    spec: "Responsible function: Finance",
  },
  {
    phase: 7,
    name: "Complete mid-year formal business review with buyer",
    spec: "Responsible function: Sales",
  },
  {
    phase: 7,
    name: "Complete post-promo analysis by program",
    spec: "Responsible function: Sales",
  },
  {
    phase: 7,
    name: "Complete distributor scorecard / quarterly performance review",
    spec: "Responsible function: Sales",
  },
  {
    phase: 7,
    name: "Conduct internal retrospective across functions",
    spec: "Responsible function: Sales",
  },
  {
    phase: 7,
    name: "Document what worked and what did not & key learnings for next cycle",
    spec: "Responsible function: Sales",
  },
  {
    phase: 7,
    name: "Feed learnings into next year's Phase 0 AOP",
    spec: "Responsible function: Sales",
  },
];
