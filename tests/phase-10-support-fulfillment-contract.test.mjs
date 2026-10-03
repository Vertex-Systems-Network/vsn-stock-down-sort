import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("PHASE-10 adds additive support request persistence to Local and hosted schemas", () => {
  const local = read("prisma/schema.prisma");
  const cloud = read("prisma/cloud/schema.prisma");
  const localMigration = read(
    "prisma/migrations/20261003182500_phase10_support_requests/migration.sql",
  );
  const cloudMigration = read(
    "prisma/cloud/migrations/20261003182500_phase10_support_requests/migration.sql",
  );

  for (const schema of [local, cloud]) {
    assert.ok(schema.includes("model SupportRequest"));
    assert.ok(schema.includes("notificationStatus String"));
    assert.ok(schema.includes("notificationError  String?"));
    assert.ok(schema.includes("@@index([shop, createdAt])"));
    assert.ok(schema.includes("@@index([shop, status, createdAt])"));
  }

  assert.ok(localMigration.includes('CREATE TABLE "SupportRequest"'));
  assert.ok(cloudMigration.includes('CREATE TABLE "SupportRequest"'));
  assert.ok(localMigration.includes("notificationStatus"));
  assert.ok(cloudMigration.includes("notificationStatus"));
});

test("support request input is bounded and request priority is server-derived", () => {
  const shared = read("app/services/support.ts");
  const service = read("app/services/support.server.ts");
  const route = read("app/routes/app.support.tsx");

  assert.ok(shared.includes("SUPPORT_REQUEST_LIMITS"));
  assert.ok(shared.includes("subject: 160"));
  assert.ok(shared.includes("message: 5000"));
  assert.ok(shared.includes("normalizeSupportRequestInput"));

  assert.ok(service.includes("priority: support.tier"));
  assert.equal(service.includes("input.priority"), false);
  assert.equal(route.includes('formData.get("priority")'), false);
  assert.ok(route.includes("resolveSupportEntitlement(current.plan)"));
});

test("support requests are authenticated, shop-scoped, persisted first and listed only for the current shop", () => {
  const route = read("app/routes/app.support.tsx");
  const service = read("app/services/support.server.ts");

  assert.ok(route.includes("authenticate.admin(request)"));
  assert.ok(route.includes("session.shop"));
  assert.ok(route.includes("listSupportRequests(session.shop)"));
  assert.ok(route.includes("createSupportRequest("));

  assert.ok(service.includes("where: { shop }"));
  assert.ok(service.includes("db.supportRequest.create"));
  assert.ok(service.includes("shop,"));
  assert.ok(service.includes('notificationStatus: hosted ? "PENDING" : "LOCAL_ONLY"'));
});

test("hosted support notification uses configured inbox without hardcoded operational promises", () => {
  const route = read("app/routes/app.support.tsx");
  const service = read("app/services/support.server.ts");
  const envExample = read(".env.example");

  assert.ok(service.includes("EMAIL?: EmailBindingLike"));
  assert.ok(service.includes("SUPPORT_INBOX_EMAIL"));
  assert.ok(service.includes("ALERT_FROM_EMAIL"));
  assert.ok(service.includes("await binding.send"));
  assert.ok(service.includes('notificationStatus: "DELIVERED"'));
  assert.ok(service.includes('notificationStatus: "FAILED"'));
  assert.ok(envExample.includes("SUPPORT_INBOX_EMAIL="));

  assert.equal(route.includes("guaranteed response"), false);
  assert.equal(route.includes("response within"), false);
  assert.equal(route.includes("mailto:"), false);
  assert.equal(service.includes("support@example"), false);
});

test("activity evidence excludes support message bodies and secret values", () => {
  const service = read("app/services/support.server.ts");
  const activityStart = service.indexOf("await recordActivityEventSafe({");
  assert.notEqual(activityStart, -1);
  const activityBlock = service.slice(activityStart);

  assert.ok(activityBlock.includes('category: "support"'));
  assert.ok(activityBlock.includes('action: "support.request_created"'));
  assert.ok(activityBlock.includes("notificationStatus"));
  assert.equal(activityBlock.includes("normalized.message"), false);
  assert.equal(activityBlock.includes("request.message"), false);
  assert.equal(activityBlock.includes("SUPPORT_INBOX_EMAIL"), false);
});

test("Staging and Production fail closed when hosted support inbox configuration is missing", () => {
  for (const path of [
    ".github/workflows/staging-readiness.yml",
    ".github/workflows/production-readiness.yml",
    ".github/workflows/environment-secrets-audit.yml",
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/cloudflare-production-prepare.yml",
    "wrangler.staging.jsonc",
    "wrangler.production.jsonc",
  ]) {
    assert.ok(read(path).includes("SUPPORT_INBOX_EMAIL"), path);
  }

  for (const path of [
    ".github/workflows/cloudflare-staging-deploy.yml",
    ".github/workflows/cloudflare-production-prepare.yml",
  ]) {
    const workflow = read(path);
    assert.ok(
      workflow.includes("SUPPORT_INBOX_EMAIL: ${{ secrets.SUPPORT_INBOX_EMAIL }}"),
      path,
    );
    assert.match(workflow, /"SUPPORT_INBOX_EMAIL"/);
  }
});
