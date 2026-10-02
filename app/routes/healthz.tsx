import type { LoaderFunctionArgs } from "react-router";
import {
  BILLING_CATALOG,
  BILLING_PLANS,
} from "../billing-config";
import {
  getAppEnvironment,
  getDatabaseMode,
  isBillingTestMode,
} from "../environment.server";

type CloudflareHealthContext = {
  cloudflare?: {
    env?: {
      STOCK_SORT_QUEUE?: unknown;
    };
  };
};

export function loader({ context }: LoaderFunctionArgs) {
  const environment = getAppEnvironment();
  const sortQueueConfigured = Boolean(
    (context as CloudflareHealthContext | undefined)?.cloudflare?.env
      ?.STOCK_SORT_QUEUE,
  );
  const sortQueueRequired = environment !== "development";
  const queueReady = !sortQueueRequired || sortQueueConfigured;
  const ok = queueReady;

  return Response.json(
    {
      ok,
      service: "vsn-stock-down-sort",
      environment,
      billingTestMode: isBillingTestMode(),
      database: getDatabaseMode(),
      sortQueue: {
        required: sortQueueRequired,
        configured: sortQueueConfigured,
        ready: queueReady,
        mode: sortQueueConfigured ? "cloudflare-queue" : "local-fallback",
      },
      billingCatalog: {
        currencyCode: BILLING_CATALOG.currencyCode,
        interval: BILLING_CATALOG.interval,
        trialDays: BILLING_CATALOG.trialDays,
        plans: BILLING_PLANS.map((plan) => ({
          id: plan.id,
          amount: plan.amount,
          currencyCode: BILLING_CATALOG.currencyCode,
          interval: BILLING_CATALOG.interval,
          trialDays: plan.trial_days,
        })),
      },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
