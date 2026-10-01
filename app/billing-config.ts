import productPlan from "../config/ai/product-plan.json";
import optionsBank from "../config/ai/options-bank.json";

export type PlanId = "starter" | "growth" | "pro" | "unlimited";

export type BillingPlan = Omit<(typeof productPlan.plans)[number], "id"> & {
  id: PlanId;
  featureNames: readonly string[];
  implementedOptionIds: readonly string[];
};

const optionNameById = new Map(
  optionsBank.options.map((option) => [option.id, option.name]),
);

export const BILLING_PLANS: readonly BillingPlan[] = Object.freeze(
  productPlan.plans.map((plan) =>
    Object.freeze({
      ...plan,
      id: plan.id as PlanId,
      featureNames: Object.freeze(
        plan.option_ids.map(
          (optionId) => optionNameById.get(optionId) ?? optionId,
        ),
      ),
      implementedOptionIds: Object.freeze(
        plan.option_ids.filter((optionId) =>
          productPlan.runtime_implemented_option_ids.includes(optionId),
        ),
      ),
    }),
  ),
);

export const BILLING_PLAN_BY_ID = Object.freeze(
  Object.fromEntries(BILLING_PLANS.map((plan) => [plan.id, plan])) as Record<
    PlanId,
    BillingPlan
  >,
);

export const LEGACY_PLAN = Object.freeze(productPlan.legacy_compatibility);

export const PRO_PLAN = BILLING_PLAN_BY_ID.unlimited;

export const PRO_PLAN_FEATURES = PRO_PLAN.featureNames;

export const IMPLEMENTED_OPTION_IDS = Object.freeze(
  productPlan.runtime_implemented_option_ids,
);

export function getBillingPlan(planId: string): BillingPlan | null {
  return BILLING_PLAN_BY_ID[planId as PlanId] ?? null;
}

export function getPlanFeatureNames(planId: string) {
  return getBillingPlan(planId)?.featureNames ?? [];
}

export function getImplementedPlanFeatureNames(planId: string) {
  const plan = getBillingPlan(planId);
  if (!plan) return [];

  return plan.implementedOptionIds.map(
    (optionId) => optionNameById.get(optionId) ?? optionId,
  );
}

export const BILLING_CATALOG = Object.freeze({
  currencyCode: productPlan.currency_code,
  interval: productPlan.billing_interval,
  trialDays: productPlan.trial_days,
  plans: BILLING_PLANS,
});
