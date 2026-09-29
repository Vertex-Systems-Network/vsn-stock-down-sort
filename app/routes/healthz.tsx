import type { LoaderFunctionArgs } from "react-router";
import { PRO_PLAN } from "../billing-config";
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
      plan: {
        id: PRO_PLAN.id,
        amount: PRO_PLAN.amount,
        currencyCode: PRO_PLAN.currencyCode,
        interval: PRO_PLAN.interval,
        trialDays: PRO_PLAN.trialDays,
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
