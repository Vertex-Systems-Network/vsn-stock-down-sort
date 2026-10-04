import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-08 integration persistence is mirrored across Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");

  for (const source of [local, cloud]) {
    assert.match(source, /model IntegrationCredential\b/);
    assert.match(source, /shop\s+String/);
    assert.match(source, /tokenPrefix\s+String\s+@unique/);
    assert.match(source, /tokenHash\s+String/);
    assert.match(source, /webhookSecretCiphertext\s+String\?/);
    assert.match(source, /scopes\s+String/);
    assert.match(source, /rateWindowStartedAt\s+DateTime\?/);
    assert.match(source, /rateRequestCount\s+Int/);
    assert.match(source, /@@index\(\[shop, enabled\]\)/);

    assert.match(source, /model IntegrationReplayNonce\b/);
    assert.match(source, /credentialId\s+String/);
    assert.match(source, /nonceHash\s+String/);
    assert.match(source, /expiresAt\s+DateTime/);
    assert.match(
      source,
      /@@unique\(\[credentialId, nonceHash\]\)/,
    );
    assert.match(source, /@@index\(\[expiresAt\]\)/);

    assert.equal(source.includes("apiToken String"), false);
    assert.equal(source.includes("webhookSecret String"), false);
  }
});

test("PHASE-08 capability is Unlimited-only and Priority Support remains separately classified", () => {
  const plan = JSON.parse(read("config/ai/product-plan.json"));
  const options = JSON.parse(read("config/ai/options-bank.json"));
  const option = options.options.find(
    (item) => item.id === "OPT-API-INTEGRATIONS",
  );
  const support = options.options.find(
    (item) => item.id === "OPT-PRIORITY-SUPPORT",
  );

  assert.equal(
    plan.runtime_implemented_option_ids.includes("OPT-API-INTEGRATIONS"),
    true,
  );
  assert.equal(option?.runtime_status, "implemented");
  assert.equal(option?.category, "enterprise");
  assert.equal(support?.category, "commercial");

  for (const planId of ["starter", "growth", "pro"]) {
    const item = plan.plans.find((entry) => entry.id === planId);
    assert.equal(
      item.option_ids.includes("OPT-API-INTEGRATIONS"),
      false,
      planId,
    );
  }

  const unlimited = plan.plans.find(
    (entry) => entry.id === "unlimited",
  );
  assert.equal(
    unlimited.option_ids.includes("OPT-API-INTEGRATIONS"),
    true,
  );
});

test("bearer tokens are hash-only and webhook secrets are encrypted at rest", () => {
  const server = read("app/services/integrations.server.ts");
  const route = read("app/routes/app.integrations.tsx");

  assert.ok(server.includes('crypto.subtle.digest('));
  assert.ok(server.includes('"SHA-256"'));
  assert.ok(server.includes("const tokenHash = await sha256Hex(token)"));
  assert.ok(server.includes("tokenHash,"));
  assert.ok(server.includes("encryptSecret("));
  assert.ok(server.includes("webhookSecretCiphertext"));
  assert.ok(server.includes("decryptSecret("));
  assert.ok(server.includes("integrationSecretContext("));

  const publicCredential = server.slice(
    server.indexOf("function publicCredential"),
    server.indexOf("export async function listIntegrationCredentials"),
  );
  assert.equal(publicCredential.includes("tokenHash:"), false);
  assert.equal(
    publicCredential.includes("webhookSecretCiphertext:"),
    false,
  );
  assert.ok(publicCredential.includes("webhookConfigured"));

  assert.ok(route.includes("oneTime"));
  assert.ok(route.includes("apiToken: result.apiToken"));
  assert.ok(route.includes("webhookSecret: result.webhookSecret"));
  assert.ok(route.includes("shown only once"));
  assert.equal(route.includes("tokenHash"), false);
  assert.equal(route.includes("webhookSecretCiphertext"), false);
});

test("external API authentication derives shop from credentials and fails closed by scope and entitlement", () => {
  const server = read("app/services/integrations.server.ts");
  const routes = [
    read("app/routes/api.v1.activity.tsx"),
    read("app/routes/api.v1.collections.sort.tsx"),
    read("app/routes/api.v1.automation.run.tsx"),
    read("app/routes/api.v1.webhooks.sort.tsx"),
  ];

  assert.ok(server.includes("parseBearerToken(request)"));
  assert.ok(server.includes("assertScope(credential, requiredScope)"));
  assert.ok(server.includes("assertApiIntegrationEntitlement("));
  assert.ok(server.includes('"feature_not_entitled"'));
  assert.ok(server.includes('"shop" in parsed'));
  assert.ok(server.includes('"shop_not_allowed"'));
  assert.ok(server.includes("Shop is derived from the authenticated integration credential."));

  for (const route of routes) {
    assert.equal(route.includes("authenticate.admin("), false);
    assert.ok(route.includes("unauthenticated.admin("));
    assert.ok(route.includes("credential.shop"));
    assert.equal(route.includes("body.shop"), false);
  }
});

test("integration credentials enforce bounded request bodies, fixed-window rate limits and no-store responses", () => {
  const server = read("app/services/integrations.server.ts");

  assert.ok(server.includes("MAX_INTEGRATION_BODY_BYTES = 16 * 1024"));
  assert.ok(server.includes("RATE_WINDOW_MS = 60_000"));
  assert.ok(server.includes("RATE_LIMIT = 60"));
  assert.ok(server.includes("rateRequestCount: { lt: RATE_LIMIT }"));
  assert.ok(server.includes("rateRequestCount: { increment: 1 }"));
  assert.ok(server.includes('"rate_limited"'));
  assert.ok(server.includes('headers.set("Retry-After"'));
  assert.ok(server.includes('headers.set("Cache-Control", "private, no-store")'));
});

test("signed webhook uses HMAC-SHA256, timestamp freshness and single-use replay nonces", () => {
  const server = read("app/services/integrations.server.ts");
  const route = read("app/routes/api.v1.webhooks.sort.tsx");

  assert.ok(server.includes('name: "HMAC", hash: "SHA-256"'));
  assert.ok(server.includes("WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300"));
  assert.ok(server.includes("REPLAY_TTL_MS = 10 * 60_000"));
  assert.ok(server.includes('"x-vsn-key-prefix"'));
  assert.ok(server.includes('"x-vsn-timestamp"'));
  assert.ok(server.includes('"x-vsn-nonce"'));
  assert.ok(server.includes('"x-vsn-signature"'));
  assert.ok(server.includes("${timestampValue}.${nonce}.${rawBody}"));
  assert.ok(server.includes('"sha256="'));
  assert.ok(server.includes("db.integrationReplayNonce.create"));
  assert.ok(server.includes('"replay_detected"'));
  assert.ok(server.includes('"P2002"'));
  assert.ok(route.includes("readIntegrationRawBody(request)"));
  assert.ok(route.includes("authenticateSignedWebhook("));
  assert.ok(route.includes('event !== "collection.sort"'));
});

test("external mutation routes are POST-only and use explicit scopes", () => {
  const sort = read("app/routes/api.v1.collections.sort.tsx");
  const automation = read("app/routes/api.v1.automation.run.tsx");
  const webhook = read("app/routes/api.v1.webhooks.sort.tsx");
  const activity = read("app/routes/api.v1.activity.tsx");
  const automationServer = read("app/services/automation.server.ts");

  for (const route of [sort, automation, webhook]) {
    assert.ok(route.includes('request.method !== "POST"'));
    assert.ok(route.includes('"method_not_allowed"'));
  }

  assert.ok(sort.includes('"collections:sort"'));
  assert.ok(automation.includes('"automation:run"'));
  assert.ok(webhook.includes("authenticateSignedWebhook("));
  assert.ok(activity.includes('"activity:read"'));
  assert.ok(
    automationServer.includes(
      'export type AutomationRunSource = "manual" | "scheduled" | "api"',
    ),
  );
  assert.ok(automation.includes('"api"'));
});

test("merchant Integrations UI is authenticated and never reads stored plaintext secrets", () => {
  const route = read("app/routes/app.integrations.tsx");
  const nav = read("app/components/Workspace.tsx");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("getCurrentSubscriptionPlan"));
  assert.ok(route.includes("listIntegrationCredentials(session.shop)"));
  assert.ok(route.includes("createIntegrationCredential("));
  assert.ok(route.includes("rotateIntegrationCredential("));
  assert.ok(route.includes("revokeIntegrationCredential("));
  assert.ok(route.includes("PHASE8_OPTION_IDS.apiIntegrations"));
  assert.ok(route.includes("/api/v1/activity"));
  assert.ok(route.includes("/api/v1/collections/sort"));
  assert.ok(route.includes("/api/v1/automation/run"));
  assert.ok(route.includes("/api/v1/webhooks/sort"));
  assert.ok(route.includes("timestamp.nonce.rawBody"));
  assert.ok(route.includes("60 accepted API/webhook authentication"));
  assert.ok(nav.includes("/app/integrations"));
});

test("integration activity evidence excludes bearer and webhook secrets", () => {
  const server = read("app/services/integrations.server.ts");

  for (const action of [
    "integration.credential_created",
    "integration.credential_rotated",
    "integration.credential_revoked",
  ]) {
    assert.ok(server.includes(action));
  }

  const activitySections = server
    .split("await recordActivityEventSafe({")
    .slice(1)
    .map((part) => part.split("});")[0]);

  for (const section of activitySections) {
    assert.equal(section.includes("apiToken"), false);
    assert.equal(section.includes("webhookSecret"), false);
    assert.equal(section.includes("tokenHash"), false);
    assert.equal(section.includes("webhookSecretCiphertext"), false);
  }

  assert.ok(server.includes("recordIntegrationRequest("));
});
