import { withPrismaClient } from "../db.server";
import { getAppEnvironment } from "../environment.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  normalizeSupportRequestInput,
  type SupportEntitlement,
  type SupportRequestInput,
} from "./support";

type EmailBindingLike = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
};

type SupportContextLike = {
  cloudflare?: {
    env?: {
      EMAIL?: EmailBindingLike;
      ALERT_FROM_EMAIL?: string;
      SUPPORT_INBOX_EMAIL?: string;
    };
  };
};

function cloudflareEnv(context: unknown) {
  return (context as SupportContextLike | undefined)?.cloudflare?.env;
}

function normalizeEmail(value: unknown, label: string) {
  const email = String(value ?? "").trim();
  if (!email) throw new Error(`Hosted Worker is missing ${label}.`);
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error(`${label} is not a valid email address.`);
  }
  return email;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeNotificationError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Support notification failed.";
  return message.slice(0, 500);
}

export async function listSupportRequests(shop: string, limit = 20) {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  return withPrismaClient((db) =>
    db.supportRequest.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
    }),
  );
}

async function notifySupportInbox(
  context: unknown,
  shop: string,
  request: {
    id: string;
    subject: string;
    message: string;
    priority: string;
  },
) {
  const env = cloudflareEnv(context);
  const binding = env?.EMAIL;
  if (!binding) {
    throw new Error("Hosted Worker is missing the EMAIL binding.");
  }

  const from = normalizeEmail(env?.ALERT_FROM_EMAIL, "ALERT_FROM_EMAIL");
  const to = normalizeEmail(
    env?.SUPPORT_INBOX_EMAIL,
    "SUPPORT_INBOX_EMAIL",
  );
  const subject = `[${request.priority}] ${request.subject} — ${shop}`;
  const text =
    `VSN Stock Down Sort support request\n\n` +
    `Request: ${request.id}\n` +
    `Shop: ${shop}\n` +
    `Priority: ${request.priority}\n` +
    `Subject: ${request.subject}\n\n` +
    request.message;
  const html =
    `<p><strong>Request:</strong> ${escapeHtml(request.id)}</p>` +
    `<p><strong>Shop:</strong> ${escapeHtml(shop)}</p>` +
    `<p><strong>Priority:</strong> ${escapeHtml(request.priority)}</p>` +
    `<p><strong>Subject:</strong> ${escapeHtml(request.subject)}</p>` +
    `<p>${escapeHtml(request.message).replaceAll("\n", "<br>")}</p>`;

  await binding.send({ to, from, subject, text, html });
}

const SUPPORT_REQUEST_RATE_LIMIT = Object.freeze({
  windowMinutes: 10,
  maxRequests: 5,
} as const);

async function assertSupportRequestRateLimit(shop: string) {
  const windowStart = new Date(
    Date.now() - SUPPORT_REQUEST_RATE_LIMIT.windowMinutes * 60 * 1000,
  );
  const recentCount = await withPrismaClient((db) =>
    db.supportRequest.count({
      where: {
        shop,
        createdAt: { gte: windowStart },
      },
    }),
  );

  if (recentCount >= SUPPORT_REQUEST_RATE_LIMIT.maxRequests) {
    throw new Error(
      "Too many support requests were submitted recently. Please try again later.",
    );
  }
}

export async function createSupportRequest(
  shop: string,
  input: Partial<Record<keyof SupportRequestInput, unknown>>,
  support: SupportEntitlement,
  context: unknown,
) {
  const normalized = normalizeSupportRequestInput(input);
  const hosted = getAppEnvironment() !== "development";
  await assertSupportRequestRateLimit(shop);

  let request = await withPrismaClient((db) =>
    db.supportRequest.create({
      data: {
        shop,
        subject: normalized.subject,
        message: normalized.message,
        priority: support.tier,
        notificationStatus: hosted ? "PENDING" : "LOCAL_ONLY",
      },
    }),
  );

  if (hosted) {
    try {
      await notifySupportInbox(context, shop, request);
      request = await withPrismaClient((db) =>
        db.supportRequest.update({
          where: { id: request.id },
          data: {
            notificationStatus: "DELIVERED",
            notificationError: null,
            notifiedAt: new Date(),
          },
        }),
      );
    } catch (error) {
      request = await withPrismaClient((db) =>
        db.supportRequest.update({
          where: { id: request.id },
          data: {
            notificationStatus: "FAILED",
            notificationError: safeNotificationError(error),
          },
        }),
      );
    }
  }

  await recordActivityEventSafe({
    shop,
    category: "support",
    action: "support.request_created",
    outcome:
      request.notificationStatus === "FAILED" ? "ERROR" : "SUCCESS",
    source: "support-request",
    entityType: "support-request",
    entityId: request.id,
    summary: "Merchant support request created.",
    details: {
      supportTier: support.tier,
      priority: request.priority,
      hosted,
      notificationStatus: request.notificationStatus,
    },
  });

  return request;
}
