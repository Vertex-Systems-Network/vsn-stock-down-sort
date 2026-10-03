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
    <s-box
      border="base base solid"
      borderRadius="large"
      padding="base"
    >
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{String(value)}</s-heading>
        {detail ? <s-text color="subdued">{detail}</s-text> : null}
      </s-stack>
    </s-box>
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
      <s-section heading="Overview">
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
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))"
              gap="base"
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
            </s-grid>
          </s-section>

          <s-section heading="Daily automation activity">
            {analytics.daily.length ? (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Date</s-table-header>
                  <s-table-header listSlot="labeled">Events</s-table-header>
                  <s-table-header listSlot="labeled">Sort runs</s-table-header>
                  <s-table-header listSlot="labeled">Visibility</s-table-header>
                  <s-table-header listSlot="labeled">Errors</s-table-header>
                  <s-table-header listSlot="labeled">Moved</s-table-header>
                  <s-table-header listSlot="labeled">Sold-out observed</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {analytics.daily.map((day) => (
                    <s-table-row key={day.date}>
                      <s-table-cell>{day.date}</s-table-cell>
                      <s-table-cell>{day.events}</s-table-cell>
                      <s-table-cell>{day.sortRuns}</s-table-cell>
                      <s-table-cell>{day.visibilityChanges}</s-table-cell>
                      <s-table-cell>{day.errors}</s-table-cell>
                      <s-table-cell>{day.movedProducts}</s-table-cell>
                      <s-table-cell>{day.soldOutObserved}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
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
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Time</s-table-header>
                <s-table-header listSlot="labeled">Action</s-table-header>
                <s-table-header listSlot="labeled">Outcome</s-table-header>
                <s-table-header listSlot="labeled">Entity</s-table-header>
                <s-table-header listSlot="labeled">Summary</s-table-header>
                <s-table-header listSlot="labeled">Moved</s-table-header>
                <s-table-header listSlot="labeled">Sold-out</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {history.map((event) => (
                  <s-table-row key={event.id}>
                    <s-table-cell>{formatTimestamp(event.occurredAt)}</s-table-cell>
                    <s-table-cell>{event.action}</s-table-cell>
                    <s-table-cell>{event.outcome}</s-table-cell>
                    <s-table-cell>
                      {event.entityType && event.entityId
                        ? `${event.entityType}: ${event.entityId}`
                        : "—"}
                    </s-table-cell>
                    <s-table-cell>{event.summary ?? "—"}</s-table-cell>
                    <s-table-cell>{event.movedProducts ?? "—"}</s-table-cell>
                    <s-table-cell>{event.soldOutProducts ?? "—"}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
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
