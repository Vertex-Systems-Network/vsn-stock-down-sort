import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import {
  INTEGRATION_SCOPES,
  PHASE8_OPTION_IDS,
} from "../services/integrations";
import {
  createIntegrationCredential,
  listIntegrationCredentials,
  revokeIntegrationCredential,
  rotateIntegrationCredential,
} from "../services/integrations.server";
import { BrandBadge, BrandButton, BrandButtonRow, BrandNotice, PageShell } from "../components/BrandUi";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const optionIds = current?.plan.option_ids ?? [];
  const origin = new URL(request.url).origin;

  return {
    currentPlan: current
      ? { id: current.plan.id, name: current.plan.name }
      : null,
    canIntegrate: optionIds.includes(PHASE8_OPTION_IDS.apiIntegrations),
    credentials: await listIntegrationCredentials(session.shop),
    endpoints: {
      activity: `${origin}/api/v1/activity`,
      sort: `${origin}/api/v1/collections/sort`,
      automation: `${origin}/api/v1/automation/run`,
      webhook: `${origin}/api/v1/webhooks/sort`,
    },
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const current = await getCurrentSubscriptionPlan(admin);
  const optionIds = current?.plan.option_ids ?? [];
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const credentialId = String(formData.get("credentialId") || "").trim();

  try {
    if (intent === "create") {
      const result = await createIntegrationCredential(
        session.shop,
        String(formData.get("name") || ""),
        formData.getAll("scopes"),
        optionIds,
      );

      return {
        ok: true,
        message:
          "Integration credential created. Copy both secrets now; they will not be shown again.",
        credentialId: result.credential.id,
        oneTime: {
          apiToken: result.apiToken,
          webhookSecret: result.webhookSecret,
        },
      };
    }

    if (intent === "rotate" && credentialId) {
      const result = await rotateIntegrationCredential(
        session.shop,
        credentialId,
        optionIds,
      );

      return {
        ok: true,
        message:
          "Integration credential rotated. Previous token and webhook secret are no longer valid.",
        credentialId,
        oneTime: {
          apiToken: result.apiToken,
          webhookSecret: result.webhookSecret,
        },
      };
    }

    if (intent === "revoke" && credentialId) {
      await revokeIntegrationCredential(session.shop, credentialId);
      return {
        ok: true,
        message: "Integration credential revoked.",
        credentialId,
        oneTime: null,
      };
    }

    return {
      ok: false,
      message: "Unknown integration action.",
      credentialId: credentialId || null,
      oneTime: null,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Integration action failed.",
      credentialId: credentialId || null,
      oneTime: null,
    };
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function IntegrationsPage() {
  const {
    currentPlan,
    canIntegrate,
    credentials,
    endpoints,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const submittedCredentialId = String(
    navigation.formData?.get("credentialId") || "",
  );
  const submittedIntent = String(
    navigation.formData?.get("intent") || "",
  );

  return (
    <PageShell heading="API & webhook integrations">
      <s-section heading="Overview">
        <s-stack gap="base">
          <s-text>
            Connect external systems without exposing Shopify session tokens.
            VSN issues a scoped bearer token for API calls and a separate
            HMAC secret for signed webhook requests.
          </s-text>

          <s-stack direction="inline" gap="base">
            {currentPlan ? (
              <BrandBadge tone="info">{currentPlan.name} plan</BrandBadge>
            ) : null}
            <BrandBadge tone={canIntegrate ? "success" : "warning"}>
              {canIntegrate
                ? "API integrations available"
                : "Unlimited plan required"}
            </BrandBadge>
          </s-stack>

          <BrandNotice tone="info">
            API tokens and webhook signing secrets are shown only once at
            creation or rotation. The API token is stored only as a SHA-256
            hash; the webhook signing secret is encrypted at rest.
          </BrandNotice>
        </s-stack>
      </s-section>

      {actionData?.message ? (
        <BrandNotice
          tone={actionData.ok ? "success" : "critical"}
          heading={actionData.ok ? "Integration updated" : "Integration failed"}
          dismissible
        >
          {actionData.message}
        </BrandNotice>
      ) : null}

      {actionData?.ok && actionData.oneTime ? (
        <s-section heading="Copy these secrets now">
          <BrandNotice tone="warning">
            These plaintext values are not available from the loader and will
            disappear after navigation or refresh.
          </BrandNotice>
          <s-stack gap="base">
            <s-text-area
              label="API bearer token"
              readOnly
              value={actionData.oneTime.apiToken}
            />
            <s-text-area
              label="Webhook HMAC secret"
              readOnly
              value={actionData.oneTime.webhookSecret}
            />
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Create integration credential">
        {!canIntegrate ? (
          <s-text color="subdued">
            External API and webhook credentials are available on Unlimited.
            Existing credentials also fail closed at runtime if entitlement is
            no longer active.
          </s-text>
        ) : (
          <form method="post">
            <input type="hidden" name="intent" value="create" />
            <s-stack gap="base">
              <s-text-field
                label="Integration name"
                name="name"
                required
                maxLength={120}
                placeholder="Warehouse automation"
              />

              <s-box background="subdued" borderRadius="large" padding="base">
                <s-stack gap="small-200">
                  <s-text type="strong">Scopes</s-text>
                  {INTEGRATION_SCOPES.map((scope) => (
                    <s-checkbox
                      key={scope}
                      name="scopes"
                      value={scope}
                      label={scope}
                    />
                  ))}
                </s-stack>
              </s-box>

              <BrandButton
                type="submit"
                variant="primary"
                disabled={busy}
                loading={busy && submittedIntent === "create"}
              >
                Create credential
              </BrandButton>
            </s-stack>
          </form>
        )}
      </s-section>

      <s-section heading="Existing credentials">
        {credentials.length === 0 ? (
          <s-text color="subdued">
            No integration credentials have been created yet.
          </s-text>
        ) : (
          <s-stack gap="large-200">
            {credentials.map((credential) => {
              const rowBusy =
                busy && submittedCredentialId === credential.id;
              return (
                <s-box
                  key={credential.id}
                  border="base base solid"
                  borderRadius="large"
                  padding="base"
                >
                  <s-stack gap="base">
                    <s-stack direction="inline" gap="base">
                      <s-heading>{credential.name}</s-heading>
                      <BrandBadge tone={credential.enabled ? "success" : "critical"}>
                        {credential.enabled ? "Active" : "Revoked"}
                      </BrandBadge>
                      <BrandBadge>
                        {credential.webhookConfigured
                          ? "Webhook configured"
                          : "No webhook secret"}
                      </BrandBadge>
                    </s-stack>

                    <s-text>
                      Token prefix: <code>{credential.tokenPrefix}</code>
                    </s-text>
                    <s-text>
                      Scopes:{" "}
                      {credential.scopes.length
                        ? credential.scopes.join(", ")
                        : "None"}
                    </s-text>
                    <s-text color="subdued">
                      Created: {formatDate(credential.createdAt)} · Last used:{" "}
                      {formatDate(credential.lastUsedAt)}
                    </s-text>

                    {credential.enabled ? (
                      <BrandButtonRow>
                        <form method="post">
                          <input type="hidden" name="intent" value="rotate" />
                          <input
                            type="hidden"
                            name="credentialId"
                            value={credential.id}
                          />
                          <BrandButton
                            type="submit"
                            variant="secondary"
                            disabled={busy || !canIntegrate}
                            loading={rowBusy && submittedIntent === "rotate"}
                          >
                            Rotate secrets
                          </BrandButton>
                        </form>

                        <form method="post">
                          <input type="hidden" name="intent" value="revoke" />
                          <input
                            type="hidden"
                            name="credentialId"
                            value={credential.id}
                          />
                          <BrandButton
                            type="submit"
                            variant="tertiary"
                            tone="critical"
                            disabled={busy}
                            loading={rowBusy && submittedIntent === "revoke"}
                          >
                            Revoke
                          </BrandButton>
                        </form>
                      </BrandButtonRow>
                    ) : null}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section heading="API endpoints">
        <s-stack gap="base">
          <s-text>
            Bearer API calls use <code>Authorization: Bearer &lt;token&gt;</code>.
            The authenticated credential determines the shop; request bodies
            must not include a shop field.
          </s-text>

          <s-box background="subdued" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-text>
                <strong>GET activity:read</strong> — {endpoints.activity}
              </s-text>
              <s-text>
                Optional query: <code>?limit=50</code> (maximum 100).
              </s-text>
            </s-stack>
          </s-box>

          <s-box background="subdued" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-text>
                <strong>POST collections:sort</strong> — {endpoints.sort}
              </s-text>
              <s-text>
                JSON body: <code>{'{"collectionId":"gid://shopify/Collection/123"}'}</code>
              </s-text>
            </s-stack>
          </s-box>

          <s-box background="subdued" borderRadius="large" padding="base">
            <s-stack gap="small-200">
              <s-text>
                <strong>POST automation:run</strong> — {endpoints.automation}
              </s-text>
              <s-text>
                JSON body: <code>{'{"ruleId":"<rule-id>"}'}</code>
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="Signed webhook">
        <s-stack gap="base">
          <s-text>
            POST <code>{endpoints.webhook}</code> using the{" "}
            <code>webhooks:sort</code> scope.
          </s-text>
          <s-text>
            Required headers: <code>X-VSN-Key-Prefix</code>,{" "}
            <code>X-VSN-Timestamp</code> (10-digit Unix seconds),{" "}
            <code>X-VSN-Nonce</code> (16–128 safe characters), and{" "}
            <code>X-VSN-Signature</code>.
          </s-text>
          <s-text>
            Signature: HMAC-SHA256 using the webhook secret over the exact
            UTF-8 string <code>timestamp.nonce.rawBody</code>, sent as{" "}
            <code>sha256=&lt;lowercase-hex&gt;</code>. Timestamp tolerance is
            five minutes and each nonce is single-use during the replay window.
          </s-text>
          <s-text>
            JSON body:{" "}
            <code>{'{"event":"collection.sort","collectionId":"gid://shopify/Collection/123"}'}</code>
          </s-text>
          <s-text color="subdued">
            Each credential is limited to 60 accepted API/webhook authentication
            attempts per one-minute database window.
          </s-text>
        </s-stack>
      </s-section>
    </PageShell>
  );
}
