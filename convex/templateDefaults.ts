import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "./_generated/dataModel";

// The deck's default checklist per phase — slide 11's activation menu plus the
// phase 0-4 items the demo plans carry. This is only the *starting content* of
// the `taskTemplates` table: the table is the source of truth and stays
// editable in Manage, so nothing outside seeding may read this constant.

type TemplateSeed = Omit<WithoutSystemFields<Doc<"taskTemplates">>, "order">;

export const DEFAULT_TASK_TEMPLATES: readonly TemplateSeed[] = [
  // Phase 0 — strategic foundation, once per plan year.
  {
    phase: 0,
    name: "Volume & value targets by chain",
    spec: "AOP targets, 9L cases and net revenue",
  },
  { phase: 0, name: "Portfolio priorities by brand", spec: "Focus SKUs and innovation slots" },
  { phase: 0, name: "Brand activity calendar", spec: "National calendar, by brand and month" },
  { phase: 0, name: "Trade spend budget envelope", spec: "By chain, with pricing guardrails" },
  { phase: 0, name: "Channel investment split (on/off premise)" },

  // Phases 1-4 — the road to an agreement, once per chain plan.
  {
    phase: 1,
    name: "Internal JBP brief",
    spec: "Reason to exist, right to win, negotiation range",
  },
  { phase: 1, name: "Spend envelope & pricing guardrails" },
  {
    phase: 1,
    name: "Shopper program menu for the chain profile",
    spec: "Which mechanics fit the banner",
  },
  {
    phase: 2,
    name: "Joint distributor plan",
    spec: "Goals, incentives, who leads the buyer meeting",
  },
  {
    phase: 2,
    name: "Distributor capability check",
    spec: "Delivery windows, MOQs, warehouse allocation",
  },
  { phase: 2, name: "Distributor incentive structure", spec: "Rep incentives tied to CWD targets" },
  { phase: 3, name: "Business review & category story deck" },
  { phase: 3, name: "JBP presentation & the ask", spec: "Items, shelf, pricing, promo calendar" },
  { phase: 3, name: "Negotiation range sign-off" },
  {
    phase: 4,
    name: "Document & book agreed terms",
    spec: "Scan-back schedule, off-invoice, program calendar",
  },
  {
    phase: 4,
    name: "Confirm distributor readiness",
    spec: "Inventory build, allocation, delivery windows",
  },
  {
    phase: 4,
    name: "State ABC compliance review",
    spec: "Pricing and POS rules for the agreed programs",
  },

  // Phases 5-8 — slide 11's menu, once per promotion.
  { phase: 5, category: "Stores list", name: "Stores list" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "Shelf talkers" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "Displays" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "3 case" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "Cold box" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "Secondary placement" },
  { phase: 5, category: "Retail Mktg Mechanics", name: "Features" },
  { phase: 5, category: "Brand Mktg Support", name: "Geo-target ads" },
  { phase: 5, category: "Brand Mktg Support", name: "Social media" },
  { phase: 5, category: "Distributor", name: "Sales rep training" },
  { phase: 6, category: "Retail Mktg Mechanics", name: "Sell-in & CWD check" },
  {
    phase: 6,
    category: "Retail Mktg Mechanics",
    name: "Store photo audit",
    spec: "GPS-tagged photo per store",
  },
  { phase: 6, category: "Retail Mktg Mechanics", name: "Price compliance check" },
  {
    phase: 7,
    name: "Post-promo depletion pull",
    spec: "Baseline vs. promotional period vs. uplift",
  },
  { phase: 7, name: "POS / scan data pull" },
  { phase: 7, name: "Spend ROI summary", spec: "$ investment vs. incremental cases" },
  { phase: 8, name: "Post-promo retro", spec: "Worked / didn't / repeat next year" },
];
