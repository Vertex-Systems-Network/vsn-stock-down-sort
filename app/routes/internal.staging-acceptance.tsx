import type { LoaderFunctionArgs } from "react-router";
import { sessionStorage, unauthenticated } from "../shopify.server";

const EXPECTED_STAGING_APP_URL =
  "https://vsn-stock-down-sort-staging.vertexsystemsnetwork.workers.dev";
const SIGNATURE_MAX_AGE_SECONDS = 300;
const SIGNED_PATH = "/internal/staging-acceptance";
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

const encoder = new TextEncoder();

type SubscriptionRead = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number | null;
};

type SubscriptionPayload = {
  data?: {
    currentAppInstallation?: {
      activeSubscriptions?: SubscriptionRead[];
    };
  };
  errors?: Array<{ message?: string }>;
};

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

    const response = await admin.graphql(`
      #graphql
      query StockDownSortStagingAcceptance {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            trialDays
          }
        }
      }
    `);

    const payload = (await response.json()) as SubscriptionPayload;
    const graphQlError = payload.errors?.find((error) => error.message)?.message;

    if (graphQlError) {
      throw new Error(graphQlError);
    }

    const subscriptions =
      payload.data?.currentAppInstallation?.activeSubscriptions ?? [];

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
        readOk: Array.isArray(subscriptions),
        activeCount: subscriptions.filter(
          (subscription) => subscription.status === "ACTIVE",
        ).length,
        statuses: subscriptions.map((subscription) => ({
          name: subscription.name,
          status: subscription.status,
          test: subscription.test,
          trialDays: subscription.trialDays,
        })),
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
