import { PRO_PLAN } from "../billing-config";
import {
  getAppEnvironment,
  getDatabaseMode,
  isBillingTestMode,
} from "../environment.server";

export function loader() {
  return Response.json({
    ok: true,
    service: "vsn-stock-down-sort",
    environment: getAppEnvironment(),
    billingTestMode: isBillingTestMode(),
    database: getDatabaseMode(),
    plan: {
      id: PRO_PLAN.id,
      amount: PRO_PLAN.amount,
      currencyCode: PRO_PLAN.currencyCode,
      interval: PRO_PLAN.interval,
      trialDays: PRO_PLAN.trialDays,
    },
  });
}
