export const PHASE9_OPTION_IDS = Object.freeze({
  prioritySupport: "OPT-PRIORITY-SUPPORT",
} as const);

export const SUPPORT_CATALOG_BY_PLAN = Object.freeze({
  starter: "standard",
  growth: "standard",
  pro: "priority",
  unlimited: "24/7 priority",
} as const);

export type SupportPlanId = keyof typeof SUPPORT_CATALOG_BY_PLAN;
export type SupportTier =
  | "STANDARD"
  | "PRIORITY"
  | "PRIORITY_24_7";

export type SupportEntitlement = {
  planId: SupportPlanId;
  tier: SupportTier;
  label: string;
  priority: boolean;
  catalogSupport: string;
};

export function resolveSupportEntitlement(plan: {
  id: string;
  support: string;
  option_ids: readonly string[];
}): SupportEntitlement {
  if (!(plan.id in SUPPORT_CATALOG_BY_PLAN)) {
    throw new Error("Unknown support plan.");
  }

  const planId = plan.id as SupportPlanId;
  const expectedSupport = SUPPORT_CATALOG_BY_PLAN[planId];
  const actualSupport = String(plan.support || "").trim().toLowerCase();

  if (actualSupport !== expectedSupport) {
    throw new Error(
      `Support catalog mismatch for ${planId}: expected ${expectedSupport}.`,
    );
  }

  const hasPriorityOption = plan.option_ids.includes(
    PHASE9_OPTION_IDS.prioritySupport,
  );
  const shouldHavePriority =
    planId === "pro" || planId === "unlimited";

  if (hasPriorityOption !== shouldHavePriority) {
    throw new Error(
      `Priority support option mapping is invalid for ${planId}.`,
    );
  }

  if (planId === "unlimited") {
    return {
      planId,
      tier: "PRIORITY_24_7",
      label: "24/7 priority support",
      priority: true,
      catalogSupport: expectedSupport,
    };
  }

  if (planId === "pro") {
    return {
      planId,
      tier: "PRIORITY",
      label: "Priority support",
      priority: true,
      catalogSupport: expectedSupport,
    };
  }

  return {
    planId,
    tier: "STANDARD",
    label: "Standard support",
    priority: false,
    catalogSupport: expectedSupport,
  };
}
