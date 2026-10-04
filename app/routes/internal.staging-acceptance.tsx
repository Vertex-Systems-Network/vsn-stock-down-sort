import type { LoaderFunctionArgs } from "react-router";
import { BILLING_CATALOG, BILLING_PLANS } from "../billing-config";
import { sessionStorage, unauthenticated } from "../shopify.server";
import { getCurrentSubscriptionPlan } from "../services/billing.server";
import { getShopifyBillingMode } from "../services/shopify-app-pricing.server";

const EXPECTED_STAGING_APP_URL =
  "https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev";
const SIGNATURE_MAX_AGE_SECONDS = 300;
const SIGNED_PATH = "/internal/staging-acceptance";
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const encoder = new TextEncoder();

function hexToBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    return null;
  }

  const pairs = value.match(/.{2}/g);
  if (!pairs) return null;

  return Uint8Array.from(
    pairs.map((pair) => Number.parseInt(pair, 16)),
  );
}

async function verifySignature(
  secret: string,
  message: string,
  signatureHex: string,
) {
  const signature = hexToBytes(signatureHex);
  if (!signature) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(message),
  );
}

function noStoreJson(payload: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");

  return Response.json(payload, {
    ...init,
    headers,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (
    process.env.APP_ENV !== "staging" ||
    process.env.SHOPIFY_APP_URL !== EXPECTED_STAGING_APP_URL
  ) {
    return new Response(null, { status: 404 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return noStoreJson(
      { ok: false, error: "Staging diagnostic unavailable." },
      { status: 503 },
    );
  }

  const shop = request.headers.get("X-VSN-Shop")?.trim().toLowerCase() ?? "";
  const timestampHeader = request.headers.get("X-VSN-Timestamp") ?? "";
  const signature = request.headers.get("X-VSN-Signature") ?? "";
  const timestamp = Number.parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);

  if (
    !SHOP_DOMAIN_PATTERN.test(shop) ||
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now - timestamp) > SIGNATURE_MAX_AGE_SECONDS
  ) {
    return noStoreJson(
      { ok: false, error: "Invalid staging diagnostic request." },
      { status: 401 },
    );
  }

  const message = `${timestamp}\n${shop}\n${SIGNED_PATH}`;
  const validSignature = await verifySignature(secret, message, signature);

  if (!validSignature) {
    return noStoreJson(
      { ok: false, error: "Invalid staging diagnostic signature." },
      { status: 401 },
    );
  }

  try {
    const storedSessions = await sessionStorage.findSessionsByShop(shop);
    const { admin, session } = await unauthenticated.admin(shop);

    const current = await getCurrentSubscriptionPlan(admin);
    const recognizedPlanIds = current ? [current.plan.id] : [];

    return noStoreJson({
      ok: true,
      shop,
      session: {
        offlineSessionAvailable: session?.isOnline === false,
        storedSessionCount: storedSessions.length,
        onlineSessionCount: storedSessions.filter(
          (storedSession) => storedSession.isOnline,
        ).length,
      },
      adminGraphql: {
        ok: true,
      },
      subscriptions: {
        readOk: true,
        activeCount: current ? 1 : 0,
        recognizedPlanIds,
        recognizedActiveCount: recognizedPlanIds.length,
        billingMethod: getShopifyBillingMode(),
        source: current?.source ?? null,
        catalog: BILLING_PLANS.map((plan) => ({
          id: plan.id,
          amount: plan.amount,
          currencyCode: BILLING_CATALOG.currencyCode,
          interval: BILLING_CATALOG.interval,
          trialDays: plan.trial_days,
        })),
        statuses: current
          ? [
              {
                name: current.subscription.name,
                status: current.subscription.status,
                test: current.subscription.test,
                trialDays: current.subscription.trialDays ?? null,
              },
            ]
          : [],
      },
    });
  } catch (error) {
    console.error(
      "[stock-down-sort-staging-acceptance] read-only diagnostic failed",
      error,
    );

    return noStoreJson(
      {
        ok: false,
        error: "Read-only staging acceptance failed.",
      },
      { status: 502 },
    );
  }
}
