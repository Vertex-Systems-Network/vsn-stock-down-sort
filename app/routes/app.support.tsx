import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  SUPPORT_REQUEST_LIMITS,
  resolveSupportEntitlement,
} from "../services/support";
import {
  createSupportRequest,
  listSupportRequests,
} from "../services/support.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const requests = await listSupportRequests(session.shop);

  return {
    currentPlan: current
      ? {
          id: current.plan.id,
          name: current.plan.name,
        }
      : null,
    support: current
      ? resolveSupportEntitlement(current.plan)
      : null,
    requests: requests.map((supportRequest) => ({
      id: supportRequest.id,
      subject: supportRequest.subject,
      priority: supportRequest.priority,
      status: supportRequest.status,
      notificationStatus: supportRequest.notificationStatus,
      notificationError: supportRequest.notificationError,
      createdAt: supportRequest.createdAt.toISOString(),
    })),
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);

  if (!current) {
    return {
      ok: false,
      message:
        "An active VSN Stock Down Sort subscription is required to contact support.",
    };
  }

  const formData = await request.formData();
  const support = resolveSupportEntitlement(current.plan);

  try {
    const supportRequest = await createSupportRequest(
      session.shop,
      {
        subject: formData.get("subject"),
        message: formData.get("message"),
      },
      support,
      context,
    );

    return {
      ok: true,
      message:
        supportRequest.notificationStatus === "FAILED"
          ? "Request saved. Hosted inbox notification failed and is recorded for follow-up."
          : "Support request submitted.",
      requestId: supportRequest.id,
      notificationStatus: supportRequest.notificationStatus,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to submit the support request.",
    };
  }
}

function fieldStyle() {
  return {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    border: "1px solid #8c9196",
    borderRadius: "8px",
    font: "inherit",
    background: "white",
  };
}

function createdLabel(value: string) {
  return value.replace("T", " ").replace(".000Z", " UTC");
}

export default function SupportPage() {
  const { currentPlan, support, requests } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <s-page heading="Support" inlineSize="large">
      <s-section>
        <s-stack gap="base">
          <s-text>
            Your active plan determines the support priority applied to every
            request. Request priority is resolved server-side and cannot be
            upgraded from this form.
          </s-text>

          {currentPlan && support ? (
            <>
              <s-stack direction="inline" gap="base">
                <s-badge tone="info">{currentPlan.name} plan</s-badge>
                <s-badge tone={support.priority ? "success" : "info"}>
                  {support.label}
                </s-badge>
              </s-stack>

              <s-box
                background="subdued"
                borderRadius="large"
                padding="base"
              >
                <s-stack gap="small-200">
                  <s-heading>{support.label}</s-heading>
                  {support.tier === "STANDARD" ? (
                    <s-text>
                      Starter and Growth include the standard support
                      entitlement.
                    </s-text>
                  ) : support.tier === "PRIORITY" ? (
                    <s-text>
                      Pro requests are marked Priority automatically.
                    </s-text>
                  ) : (
                    <s-text>
                      Unlimited requests are marked 24/7 Priority automatically.
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            </>
          ) : (
            <s-banner tone="warning">
              No recognized active VSN plan is available for support
              entitlement resolution.
            </s-banner>
          )}
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <s-banner
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Support request recorded" : "Unable to submit"}
          dismissible
        >
          {actionData.message}
          {actionData.ok && actionData.requestId
            ? ` Request ID: ${actionData.requestId}`
            : ""}
        </s-banner>
      ) : null}

      <s-section heading="Open a support request">
        <form method="post">
          <s-stack gap="base">
            <label>
              <strong>Subject</strong>
              <input
                type="text"
                name="subject"
                required
                maxLength={SUPPORT_REQUEST_LIMITS.subject}
                placeholder="What do you need help with?"
                style={fieldStyle()}
              />
            </label>

            <label>
              <strong>Message</strong>
              <textarea
                name="message"
                required
                maxLength={SUPPORT_REQUEST_LIMITS.message}
                placeholder="Describe the issue, expected behavior, and any relevant collection or product context."
                style={{ ...fieldStyle(), minHeight: 150 }}
              />
            </label>

            <s-text color="subdued">
              Do not paste passwords, Shopify access tokens, database
              credentials, or other secrets into support requests.
            </s-text>

            <s-button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={busy || !support}
            >
              Submit support request
            </s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section heading="Recent requests">
        {requests.length ? (
          <s-stack gap="base">
            {requests.map((supportRequest) => (
              <s-box
                key={supportRequest.id}
                border="base base solid"
                borderRadius="large"
                padding="base"
              >
                <s-stack gap="small-200">
                  <s-stack direction="inline" gap="base">
                    <s-badge tone="info">{supportRequest.priority}</s-badge>
                    <s-badge
                      tone={
                        supportRequest.notificationStatus === "FAILED"
                          ? "critical"
                          : supportRequest.notificationStatus === "DELIVERED"
                            ? "success"
                            : "info"
                      }
                    >
                      {supportRequest.notificationStatus}
                    </s-badge>
                    <s-text>{supportRequest.status}</s-text>
                  </s-stack>
                  <s-heading>{supportRequest.subject}</s-heading>
                  <s-text color="subdued">
                    {supportRequest.id} · {createdLabel(supportRequest.createdAt)}
                  </s-text>
                  {supportRequest.notificationError ? (
                    <s-text color="subdued">
                      Notification issue: {supportRequest.notificationError}
                    </s-text>
                  ) : null}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        ) : (
          <s-text color="subdued">No support requests have been created yet.</s-text>
        )}
      </s-section>

      <s-section>
        <s-banner tone="info" heading="Support terms">
          The app provides the request channel and plan-derived priority. It
          does not publish a response-time SLA, staffing level, or escalation
          deadline unless those terms are separately defined by VSN operations.
        </s-banner>
      </s-section>
    </s-page>
  );
}
