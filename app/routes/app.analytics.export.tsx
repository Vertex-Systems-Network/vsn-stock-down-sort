import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  activityHistoryToCsv,
  getCsvActivityHistory,
  recordActivityEventSafe,
} from "../services/analytics.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return new Response("Active subscription required.", { status: 403 });
  }

  try {
    const exported = await getCsvActivityHistory(
      session.shop,
      current.plan.option_ids,
      current.plan.history_retention_days,
    );
    const csv = activityHistoryToCsv(exported.rows);
    const date = new Date().toISOString().slice(0, 10);

    await recordActivityEventSafe({
      shop: session.shop,
      category: "analytics",
      action: "activity.csv_exported",
      outcome: "SUCCESS",
      source: "analytics-export",
      summary: `Exported ${exported.rows.length} activity rows to CSV.`,
      details: {
        rowCount: exported.rows.length,
        capped: exported.capped,
        rowLimit: exported.rowLimit,
      },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vsn-stock-down-sort-activity-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "CSV export failed.",
      { status: 403 },
    );
  }
}
