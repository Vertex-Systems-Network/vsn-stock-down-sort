import { withPrismaClient } from "../db.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  assertApiIntegrationEntitlement,
  normalizeIntegrationScopes,
  parseIntegrationScopes,
  type IntegrationScope,
} from "./integrations";
import {
  decryptSecret,
  encryptSecret,
} from "./secret-crypto.server";

type AdminClient = Parameters<typeof getCurrentSubscriptionPlan>[0];

export class IntegrationHttpError extends Error {
  status: number;
  code: string;
  retryAfter?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "IntegrationHttpError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const API_TOKEN_PREFIX_BYTES = 9;
const API_TOKEN_SECRET_BYTES = 32;
const WEBHOOK_SECRET_BYTES = 32;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;
const REPLAY_TTL_MS = 10 * 60_000;

function randomBase64Url(byteLength: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Buffer.from(bytes).toString("base64url");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("hex");
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Buffer.from(signature).toString("hex");
}

function constantTimeEqualHex(left: string, right: string) {
  if (
    left.length !== right.length ||
    left.length === 0 ||
    left.length % 2 !== 0
  ) {
    return false;
  }

  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

function integrationSecretContext(shop: string, credentialId: string) {
  return `integration-webhook:${shop}:${credentialId}`;
}

function generateApiToken() {
  const prefix = randomBase64Url(API_TOKEN_PREFIX_BYTES);
  const secret = randomBase64Url(API_TOKEN_SECRET_BYTES);
  return {
    prefix,
    token: `vsn_${prefix}_${secret}`,
  };
}

function generateWebhookSecret() {
  return `whsec_${randomBase64Url(WEBHOOK_SECRET_BYTES)}`;
}

function publicCredential(credential: {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string;
  enabled: boolean;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  webhookSecretCiphertext?: string | null;
}) {
  return {
    id: credential.id,
    name: credential.name,
    tokenPrefix: credential.tokenPrefix,
    scopes: parseIntegrationScopes(credential.scopes),
    enabled: credential.enabled,
    webhookConfigured: Boolean(credential.webhookSecretCiphertext),
    lastUsedAt: credential.lastUsedAt,
    revokedAt: credential.revokedAt,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
  };
}

export async function listIntegrationCredentials(shop: string) {
  const credentials = await withPrismaClient((db) =>
    db.integrationCredential.findMany({
      where: { shop },
      orderBy: [{ enabled: "desc" }, { createdAt: "desc" }],
    }),
  );

  return credentials.map(publicCredential);
}

export async function createIntegrationCredential(
  shop: string,
  nameInput: unknown,
  scopeInputs: unknown[],
) {
  const name = String(nameInput ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Integration name is required.");

  const scopes = normalizeIntegrationScopes(scopeInputs);
  if (!scopes.length) {
    throw new Error("Select at least one integration scope.");
  }

  const { prefix, token } = generateApiToken();
  const tokenHash = await sha256Hex(token);
  const webhookSecret = generateWebhookSecret();

  const created = await withPrismaClient((db) =>
    db.integrationCredential.create({
      data: {
        shop,
        name,
        tokenPrefix: prefix,
        tokenHash,
        scopes: scopes.join("\n"),
      },
    }),
  );

  const webhookSecretCiphertext = await encryptSecret(
    webhookSecret,
    integrationSecretContext(shop, created.id),
  );

  const credential = await withPrismaClient((db) =>
    db.integrationCredential.update({
      where: { id: created.id },
      data: { webhookSecretCiphertext },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "integrations",
    action: "integration.credential_created",
    outcome: "SUCCESS",
    source: "integration-settings",
    entityType: "integration_credential",
    entityId: credential.id,
    summary: "External integration credential created.",
    details: {
      name: credential.name,
      tokenPrefix: credential.tokenPrefix,
      scopes,
    },
  });

  return {
    credential: publicCredential(credential),
    apiToken: token,
    webhookSecret,
  };
}

export async function rotateIntegrationCredential(
  shop: string,
  credentialId: string,
) {
  const existing = await withPrismaClient((db) =>
    db.integrationCredential.findUnique({
      where: { id: credentialId },
    }),
  );
  if (!existing || existing.shop !== shop || !existing.enabled) {
    throw new Error("Active integration credential not found.");
  }

  const { prefix, token } = generateApiToken();
  const tokenHash = await sha256Hex(token);
  const webhookSecret = generateWebhookSecret();
  const webhookSecretCiphertext = await encryptSecret(
    webhookSecret,
    integrationSecretContext(shop, credentialId),
  );

  const credential = await withPrismaClient((db) =>
    db.integrationCredential.update({
      where: { id: credentialId },
      data: {
        tokenPrefix: prefix,
        tokenHash,
        webhookSecretCiphertext,
        rateWindowStartedAt: null,
        rateRequestCount: 0,
      },
    }),
  );

  await withPrismaClient((db) =>
    db.integrationReplayNonce.deleteMany({
      where: { credentialId },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "integrations",
    action: "integration.credential_rotated",
    outcome: "SUCCESS",
    source: "integration-settings",
    entityType: "integration_credential",
    entityId: credential.id,
    summary: "External integration credential rotated.",
    details: {
      name: credential.name,
      tokenPrefix: credential.tokenPrefix,
      scopes: parseIntegrationScopes(credential.scopes),
    },
  });

  return {
    credential: publicCredential(credential),
    apiToken: token,
    webhookSecret,
  };
}

export async function revokeIntegrationCredential(
  shop: string,
  credentialId: string,
) {
  const existing = await withPrismaClient((db) =>
    db.integrationCredential.findUnique({
      where: { id: credentialId },
    }),
  );
  if (!existing || existing.shop !== shop) {
    throw new Error("Integration credential not found.");
  }

  const now = new Date();
  const revokedTokenHash = await sha256Hex(
    `revoked:${credentialId}:${now.toISOString()}:${randomBase64Url(16)}`,
  );
  const credential = await withPrismaClient((db) =>
    db.integrationCredential.update({
      where: { id: credentialId },
      data: {
        enabled: false,
        revokedAt: now,
        webhookSecretCiphertext: null,
        tokenHash: revokedTokenHash,
        rateWindowStartedAt: null,
        rateRequestCount: 0,
      },
    }),
  );

  await withPrismaClient((db) =>
    db.integrationReplayNonce.deleteMany({
      where: { credentialId },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "integrations",
    action: "integration.credential_revoked",
    outcome: "SUCCESS",
    source: "integration-settings",
    entityType: "integration_credential",
    entityId: credential.id,
    summary: "External integration credential revoked.",
    details: {
      name: credential.name,
      tokenPrefix: credential.tokenPrefix,
    },
  });

  return publicCredential(credential);
}

function parseBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(vsn_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{40,})$/);
  if (!match) {
    throw new IntegrationHttpError(
      401,
      "invalid_credentials",
      "A valid VSN bearer token is required.",
    );
  }

  const token = match[1];
  const prefix = token.split("_")[1];
  if (!prefix) {
    throw new IntegrationHttpError(
      401,
      "invalid_credentials",
      "A valid VSN bearer token is required.",
    );
  }

  return { token, prefix };
}

async function consumeRateLimit(credentialId: string, now = new Date()) {
  const cutoff = new Date(now.getTime() - RATE_WINDOW_MS);

  const reset = await withPrismaClient((db) =>
    db.integrationCredential.updateMany({
      where: {
        id: credentialId,
        enabled: true,
        OR: [
          { rateWindowStartedAt: null },
          { rateWindowStartedAt: { lte: cutoff } },
        ],
      },
      data: {
        rateWindowStartedAt: now,
        rateRequestCount: 1,
        lastUsedAt: now,
      },
    }),
  );

  if (reset.count === 1) return;

  const incremented = await withPrismaClient((db) =>
    db.integrationCredential.updateMany({
      where: {
        id: credentialId,
        enabled: true,
        rateWindowStartedAt: { gt: cutoff },
        rateRequestCount: { lt: RATE_LIMIT },
      },
      data: {
        rateRequestCount: { increment: 1 },
        lastUsedAt: now,
      },
    }),
  );

  if (incremented.count !== 1) {
    throw new IntegrationHttpError(
      429,
      "rate_limited",
      "Integration request limit exceeded.",
      60,
    );
  }
}

function assertScope(
  credential: { scopes: string },
  requiredScope: IntegrationScope,
) {
  if (!parseIntegrationScopes(credential.scopes).includes(requiredScope)) {
    throw new IntegrationHttpError(
      403,
      "insufficient_scope",
      `Integration credential is missing scope ${requiredScope}.`,
    );
  }
}

async function assertUnlimitedPlan(
  admin: AdminClient,
) {
  const current = await getCurrentSubscriptionPlan(admin);
  if (!current) {
    throw new IntegrationHttpError(
      403,
      "subscription_required",
      "An active VSN Stock Down Sort subscription is required.",
    );
  }

  try {
    assertApiIntegrationEntitlement(current.plan.option_ids);
  } catch (error) {
    throw new IntegrationHttpError(
      403,
      "feature_not_entitled",
      error instanceof Error
        ? error.message
        : "API integrations are not included in the current plan.",
    );
  }

  return current;
}

export type AuthenticatedIntegration = {
  credential: {
    id: string;
    shop: string;
    name: string;
    tokenPrefix: string;
    scopes: string;
    webhookSecretCiphertext: string | null;
  };
};

export async function authenticateIntegrationApi(
  request: Request,
  requiredScope: IntegrationScope,
): Promise<AuthenticatedIntegration> {
  const { token, prefix } = parseBearerToken(request);
  const credential = await withPrismaClient((db) =>
    db.integrationCredential.findUnique({
      where: { tokenPrefix: prefix },
    }),
  );

  if (!credential || !credential.enabled || credential.revokedAt) {
    throw new IntegrationHttpError(
      401,
      "invalid_credentials",
      "Integration credential is invalid or revoked.",
    );
  }

  const expectedHash = await sha256Hex(token);
  if (!constantTimeEqualHex(expectedHash, credential.tokenHash)) {
    throw new IntegrationHttpError(
      401,
      "invalid_credentials",
      "Integration credential is invalid or revoked.",
    );
  }

  assertScope(credential, requiredScope);
  await consumeRateLimit(credential.id);

  return { credential };
}

function webhookHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      `Missing ${name} header.`,
    );
  }
  return value;
}

function uniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function authenticateSignedWebhook(
  request: Request,
  rawBody: string,
): Promise<AuthenticatedIntegration> {
  const prefix = webhookHeader(request, "x-vsn-key-prefix");
  if (!/^[A-Za-z0-9_-]{12}$/.test(prefix)) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      "Webhook integration prefix is invalid.",
    );
  }

  const credential = await withPrismaClient((db) =>
    db.integrationCredential.findUnique({
      where: { tokenPrefix: prefix },
    }),
  );
  if (
    !credential ||
    !credential.enabled ||
    credential.revokedAt ||
    !credential.webhookSecretCiphertext
  ) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      "Webhook integration credential is invalid.",
    );
  }

  assertScope(credential, "webhooks:sort");

  const timestampValue = webhookHeader(request, "x-vsn-timestamp");
  const nonce = webhookHeader(request, "x-vsn-nonce");
  const signatureValue = webhookHeader(request, "x-vsn-signature");

  if (!/^\d{10}$/.test(timestampValue)) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      "Webhook timestamp is invalid.",
    );
  }
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(nonce)) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      "Webhook nonce is invalid.",
    );
  }

  const timestampSeconds = Number(timestampValue);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    Math.abs(nowSeconds - timestampSeconds) >
    WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
  ) {
    throw new IntegrationHttpError(
      401,
      "stale_signature",
      "Webhook signature timestamp is outside the allowed window.",
    );
  }

  const secret = await decryptSecret(
    credential.webhookSecretCiphertext,
    integrationSecretContext(credential.shop, credential.id),
  );
  const expected = await hmacHex(
    secret,
    `${timestampValue}.${nonce}.${rawBody}`,
  );
  const supplied = signatureValue.startsWith("sha256=")
    ? signatureValue.slice("sha256=".length)
    : "";

  if (!constantTimeEqualHex(expected, supplied)) {
    throw new IntegrationHttpError(
      401,
      "invalid_signature",
      "Webhook signature does not match.",
    );
  }

  await consumeRateLimit(credential.id);

  const now = new Date();
  const nonceHash = await sha256Hex(nonce);
  await withPrismaClient((db) =>
    db.integrationReplayNonce.deleteMany({
      where: { expiresAt: { lte: now } },
    }),
  );

  try {
    await withPrismaClient((db) =>
      db.integrationReplayNonce.create({
        data: {
          credentialId: credential.id,
          nonceHash,
          expiresAt: new Date(now.getTime() + REPLAY_TTL_MS),
        },
      }),
    );
  } catch (error) {
    if (uniqueConstraintError(error)) {
      throw new IntegrationHttpError(
        409,
        "replay_detected",
        "Webhook nonce has already been used.",
      );
    }
    throw error;
  }

  return { credential };
}

export async function authorizeIntegrationRuntime(
  admin: AdminClient,
) {
  return assertUnlimitedPlan(admin);
}

export function integrationJson(
  payload: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

export function integrationErrorResponse(error: unknown) {
  const normalized =
    error instanceof IntegrationHttpError
      ? error
      : new IntegrationHttpError(
          500,
          "internal_error",
          "Integration request failed.",
        );

  const headers = new Headers();
  if (normalized.retryAfter) {
    headers.set("Retry-After", String(normalized.retryAfter));
  }

  return integrationJson(
    {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    },
    {
      status: normalized.status,
      headers,
    },
  );
}

export async function recordIntegrationRequest(
  shop: string,
  credentialId: string,
  action: string,
  outcome: "SUCCESS" | "ERROR",
  details: Record<string, unknown>,
) {
  await recordActivityEventSafe({
    shop,
    category: "integrations",
    action,
    outcome,
    source: "external-integration",
    entityType: "integration_credential",
    entityId: credentialId,
    summary:
      outcome === "SUCCESS"
        ? "External integration request completed."
        : "External integration request failed.",
    details,
  });
}
