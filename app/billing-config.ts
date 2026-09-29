export const PRO_PLAN = Object.freeze({
  id: "pro-plan",
  name: "VSN Stock Down Sort Pro",
  amount: 55,
  currencyCode: "USD" as const,
  interval: "EVERY_30_DAYS" as const,
  trialDays: 5,
});

export const PRO_PLAN_FEATURES = Object.freeze([
  "Unlimited products",
  "Unlimited collections",
  "Automatic sold-out products moved to the end",
  "Automatic re-sorting after inventory and product updates",
  "Manual Sort now control for enabled collections",
  "Bulk enable and disable across collections",
  "Restore the previous Shopify sort order when disabling",
  "Keeps available products ahead of sold-out products",
  "24/7 support",
]);
