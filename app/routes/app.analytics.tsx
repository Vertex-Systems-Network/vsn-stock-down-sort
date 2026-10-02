import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  PHASE4_OPTION_IDS,
  hasPhase4Entitlement,
} from "../services/analytics";
import {
  getActivityHistory,
  getAutomationAnalytics,
} from "../services/analytics.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const optionIds = current?.plan.option_ids ?? [];
  const retentionDays = current?.plan.history_retention_days ?? null;

  const canAnalytics = hasPhase4Entitlement(
    optionIds,
    PHASE4_OPTION_IDS.analytics,
  );
  const canHistory = hasPhase4Entitlement(
    optionIds,
    PHASE4_OPTION_IDS.activityHistory,
  );
  const canCsv = hasPhase4Entitlement(
    optionIds,
    PHASE4_OPTION_IDS.csvExport,
  );

  const [analytics, history] = await Promise.all([
    canAnalytics
      ? getAutomationAnalytics(session.shop, optionIds, retentionDays, 30)
      : null,
    canHistory
      ? getActivityHistory(session.shop, optionIds, retentionDays, 100)
      : [],
  ]);

  const url = new URL(request.url);
  const exportUrl = canCsv
    ? `/app/analytics/export${url.search}`
    : null;

  return {
    currentPlan: current
      ? {
          id: current.plan.id,
          name: current.plan.name,
        }
      : null,
    retentionDays,
    canAnalytics,
    canHistory,
    canCsv,
    analytics,
    history,
    exportUrl,
  };
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #d7d7d7",
        borderRadius: 12,
        padding: 16,
        minHeight: 104,
      }}
    >
      <div style={{ fontSize: 13, color: "#616161", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      {detail ? (
        <div style={{ fontSize: 12, color: "#616161", marginTop: 6 }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleString();
}

export default function AnalyticsPage() {
  const {
    currentPlan,
    retentionDays,
    canAnalytics,
    canHistory,
    canCsv,
    analytics,
    history,
    exportUrl,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics & activity">
      <s-section>
        <s-stack gap="base">
          <s-text>
            Review real automation activity recorded by VSN Stock Down Sort.
            Dashboard values are calculated from persisted sorting, visibility
            and settings events for this shop.
          </s-text>

          {currentPlan ? (
            <s-badge tone="info">{currentPlan.name} plan</s-badge>
          ) : null}

          {!canAnalytics && !canHistory ? (
            <s-banner tone="warning">
              Analytics and activity history are available on plans that include
              the PHASE-04 observability capabilities.
            </s-banner>
          ) : null}

          <s-text color="subdued">
            History retention:{" "}
            {retentionDays == null
              ? "unlimited by plan"
              : `${retentionDays} days`}
          </s-text>

          {canCsv && exportUrl ? (
            <s-link href={exportUrl} target="_top">
              Export activity CSV
            </s-link>
          ) : (
            <s-text color="subdued">
              CSV export is not included in the current plan.
            </s-text>
          )}
        </s-stack>
      </s-section>

      {canAnalytics && analytics ? (
        <>
          <s-section heading="Last 30 days">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <MetricCard
                label="Recorded events"
                value={analytics.totalEvents}
                detail={analytics.truncated ? "Result window capped" : undefined}
              />
              <MetricCard label="Sort runs" value={analytics.sortRuns} />
              <MetricCard
                label="Visibility changes"
                value={analytics.visibilityChanges}
              />
              <MetricCard
                label="Products moved"
                value={analytics.productsMoved}
              />
              <MetricCard
                label="Sold-out observations"
                value={analytics.soldOutObserved}
              />
              <MetricCard label="Errors" value={analytics.errorEvents} />
              <MetricCard
                label="Collections touched"
                value={analytics.uniqueCollections}
              />
              <MetricCard
                label="Products touched"
                value={analytics.uniqueProducts}
                detail={`Last activity: ${formatTimestamp(
                  analytics.lastActivityAt,
                )}`}
              />
            </div>
          </s-section>

          <s-section heading="Daily automation activity">
            {analytics.daily.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Events",
                        "Sort runs",
                        "Visibility",
                        "Errors",
                        "Moved",
                        "Sold-out observed",
                      ].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            textAlign: "left",
                            padding: "10px 8px",
                            borderBottom: "1px solid #d7d7d7",
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.daily.map((day) => (
                      <tr key={day.date}>
                        <td style={{ padding: "10px 8px" }}>{day.date}</td>
                        <td style={{ padding: "10px 8px" }}>{day.events}</td>
                        <td style={{ padding: "10px 8px" }}>{day.sortRuns}</td>
                        <td style={{ padding: "10px 8px" }}>
                          {day.visibilityChanges}
                        </td>
                        <td style={{ padding: "10px 8px" }}>{day.errors}</td>
                        <td style={{ padding: "10px 8px" }}>
                          {day.movedProducts}
                        </td>
                        <td style={{ padding: "10px 8px" }}>
                          {day.soldOutObserved}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <s-text color="subdued">
                No runtime activity has been recorded in this period yet.
              </s-text>
            )}
          </s-section>
        </>
      ) : null}

      {canHistory ? (
        <s-section heading="Recent activity">
          {history.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {[
                      "Time",
                      "Action",
                      "Outcome",
                      "Entity",
                      "Summary",
                      "Moved",
                      "Sold-out",
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          textAlign: "left",
                          padding: "10px 8px",
                          borderBottom: "1px solid #d7d7d7",
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((event) => (
                    <tr key={event.id}>
                      <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                        {formatTimestamp(event.occurredAt)}
                      </td>
                      <td style={{ padding: "10px 8px" }}>{event.action}</td>
                      <td style={{ padding: "10px 8px" }}>{event.outcome}</td>
                      <td style={{ padding: "10px 8px" }}>
                        {event.entityType && event.entityId
                          ? `${event.entityType}: ${event.entityId}`
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        {event.summary ?? "—"}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        {event.movedProducts ?? "—"}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        {event.soldOutProducts ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <s-text color="subdued">
              No activity events have been recorded for this shop yet.
            </s-text>
          )}
        </s-section>
      ) : null}
    </s-page>
  );
}
