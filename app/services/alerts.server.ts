import { withPrismaClient } from "../db.server";
import { getAppEnvironment } from "../environment.server";
import { getCurrentSubscriptionPlan } from "./billing.server";
import { recordActivityEventSafe } from "./analytics.server";
import {
  PHASE6_OPTION_IDS,
  assertAlertEntitlements,
  normalizeAlertSettingInput,
  normalizeEmailRecipients,
  normalizeSlackWebhookUrl,
  type AlertSettingInput,
} from "./alerts";
import { decryptSecret, encryptSecret } from "./secret-crypto.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type EmailBindingLike = {
  send(message: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
};

type AlertContextLike = {
  cloudflare?: {
    env?: {
      EMAIL?: EmailBindingLike;
      ALERT_FROM_EMAIL?: string;
    };
  };
};

type ProductAlertSource = {
  id: string;
  title: string;
  handle: string;
  totalInventory: number | null;
  tracksInventory: boolean;
};

const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MINUTES = 360;

function cloudflareEnv(context: unknown) {
  return (context as AlertContextLike | undefined)?.cloudflare?.env;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function gql<T>(
  admin: AdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  const errorMessage = payload.errors?.find((error) => error.message)?.message;
  if (errorMessage) throw new Error(errorMessage);
  if (!payload.data) throw new Error("Shopify GraphQL response had no data.");
  return payload.data;
}

async function currentOptionIds(admin: AdminClient) {
  const current = await getCurrentSubscriptionPlan(
    admin as Parameters<typeof getCurrentSubscriptionPlan>[0],
  );
  return current?.plan.option_ids ?? null;
}

async function getProductForAlert(
  admin: AdminClient,
  productId: string,
): Promise<ProductAlertSource | null> {
  const data = await gql<{ product: ProductAlertSource | null }>(
    admin,
    `#graphql
      query ProductForLowStockAlert($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          totalInventory
          tracksInventory
        }
      }
    `,
    { id: productId },
  );

  return data.product;
}

export async function getAlertSetting(shop: string) {
  const setting = await withPrismaClient((db) =>
    db.alertSetting.findUnique({ where: { shop } }),
  );

  return {
    shop,
    threshold: setting?.threshold ?? DEFAULT_THRESHOLD,
    cooldownMinutes:
      setting?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES,
    emailEnabled: setting?.emailEnabled ?? false,
    emailRecipients: setting?.emailRecipients ?? "",
    slackEnabled: setting?.slackEnabled ?? false,
    slackWebhookConfigured: Boolean(setting?.slackWebhookCiphertext),
    createdAt: setting?.createdAt ?? null,
    updatedAt: setting?.updatedAt ?? null,
  };
}

export async function saveAlertSetting(
  shop: string,
  input: Partial<Record<keyof AlertSettingInput, unknown>>,
  optionIds: readonly string[],
  slackWebhookInput?: unknown,
  clearSlackWebhook = false,
) {
  const normalized = normalizeAlertSettingInput(input);
  assertAlertEntitlements(normalized, optionIds);

  const existing = await withPrismaClient((db) =>
    db.alertSetting.findUnique({ where: { shop } }),
  );

  const normalizedSlackWebhook = normalizeSlackWebhookUrl(slackWebhookInput);
  let slackWebhookCiphertext = clearSlackWebhook
    ? null
    : existing?.slackWebhookCiphertext ?? null;

  if (normalizedSlackWebhook) {
    slackWebhookCiphertext = await encryptSecret(
      normalizedSlackWebhook,
      `slack-webhook:${shop}`,
    );
  }

  if (normalized.slackEnabled && !slackWebhookCiphertext) {
    throw new Error(
      "Configure a Slack incoming webhook before enabling Slack alerts.",
    );
  }

  const thresholdChanged =
    existing !== null && existing.threshold !== normalized.threshold;

  const setting = await withPrismaClient(async (db) => {
    const saved = await db.alertSetting.upsert({
      where: { shop },
      create: {
        shop,
        ...normalized,
        slackWebhookCiphertext,
      },
      update: {
        ...normalized,
        slackWebhookCiphertext,
      },
    });

    if (thresholdChanged) {
      await db.lowStockAlertState.deleteMany({ where: { shop } });
    }

    return saved;
  });

  await recordActivityEventSafe({
    shop,
    category: "alerts",
    action: "alerts.settings_saved",
    outcome: "SUCCESS",
    source: "alert-settings",
    summary: "Low-stock alert settings updated.",
    details: {
      threshold: setting.threshold,
      cooldownMinutes: setting.cooldownMinutes,
      emailEnabled: setting.emailEnabled,
      emailRecipientCount: normalizeEmailRecipients(
        setting.emailRecipients,
      ).length,
      slackEnabled: setting.slackEnabled,
      slackWebhookConfigured: Boolean(setting.slackWebhookCiphertext),
      thresholdStateReset: thresholdChanged,
    },
  });

  return getAlertSetting(shop);
}

function channelDue(
  lastAlertAt: Date | null | undefined,
  firstLowObservation: boolean,
  cooldownMinutes: number,
  now: Date,
) {
  if (firstLowObservation) return true;
  if (!lastAlertAt) return true;
  return (
    now.getTime() - lastAlertAt.getTime() >=
    cooldownMinutes * 60 * 1000
  );
}

async function sendEmailAlerts(
  context: unknown,
  recipients: string[],
  product: ProductAlertSource,
  inventory: number,
  threshold: number,
) {
  const env = cloudflareEnv(context);
  const binding = env?.EMAIL;
  const from = env?.ALERT_FROM_EMAIL?.trim();

  if (!binding) {
    throw new Error("Hosted Worker is missing the EMAIL binding.");
  }
  if (!from) {
    throw new Error("Hosted Worker is missing ALERT_FROM_EMAIL.");
  }

  const subject = `Low stock: ${product.title}`;
  const text =
    `${product.title} has ${inventory} item(s) in stock, at or below the configured threshold of ${threshold}.\n\n` +
    `Product handle: ${product.handle}`;
  const html =
    `<p><strong>${escapeHtml(product.title)}</strong> has ${inventory} item(s) in stock, ` +
    `at or below the configured threshold of ${threshold}.</p>` +
    `<p>Product handle: ${escapeHtml(product.handle)}</p>`;

  for (const recipient of recipients) {
    await binding.send({
      to: recipient,
      from,
      subject,
      text,
      html,
    });
  }
}

async function sendSlackAlert(
  webhookCiphertext: string,
  shop: string,
  product: ProductAlertSource,
  inventory: number,
  threshold: number,
) {
  const plaintext = await decryptSecret(
    webhookCiphertext,
    `slack-webhook:${shop}`,
  );
  const webhookUrl = normalizeSlackWebhookUrl(plaintext);
  if (!webhookUrl) {
    throw new Error("Slack webhook configuration is missing.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text:
        `VSN Stock Down Sort low-stock alert: ${product.title} has ${inventory} item(s) in stock ` +
        `(threshold: ${threshold}).`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Slack incoming webhook failed with HTTP ${response.status}: ${body.slice(0, 200)}`,
    );
  }
}

export async function processLowStockAlert(
  admin: AdminClient,
  shop: string,
  productId: string,
  context: unknown,
  entitledOptionIds?: readonly string[],
) {
  const optionIds =
    entitledOptionIds ?? (await currentOptionIds(admin));

  if (!optionIds) {
    return {
      productId,
      lowStock: false,
      delivered: false,
      reason: "inactive-subscription",
    };
  }

  const setting = await withPrismaClient((db) =>
    db.alertSetting.findUnique({ where: { shop } }),
  );

  if (!setting || (!setting.emailEnabled && !setting.slackEnabled)) {
    return {
      productId,
      lowStock: false,
      delivered: false,
      reason: "alerts-disabled",
    };
  }

  const product = await getProductForAlert(admin, productId);
  if (!product) {
    return {
      productId,
      lowStock: false,
      delivered: false,
      reason: "product-not-found",
    };
  }

  const inventory = product.totalInventory ?? 0;
  const now = new Date();
  const state = await withPrismaClient((db) =>
    db.lowStockAlertState.findUnique({
      where: { shop_productId: { shop, productId } },
    }),
  );

  if (!product.tracksInventory) {
    await withPrismaClient((db) =>
      db.lowStockAlertState.upsert({
        where: { shop_productId: { shop, productId } },
        create: {
          shop,
          productId,
          lastInventory: null,
          lastObservedAt: now,
        },
        update: {
          lastInventory: null,
          lastObservedAt: now,
        },
      }),
    );

    return {
      productId,
      lowStock: false,
      delivered: false,
      reason: "inventory-not-tracked",
    };
  }

  const lowStock = inventory <= setting.threshold;
  const firstLowObservation =
    lowStock &&
    (state?.lastInventory == null ||
      state.lastInventory > setting.threshold);

  if (!lowStock) {
    await withPrismaClient((db) =>
      db.lowStockAlertState.upsert({
        where: { shop_productId: { shop, productId } },
        create: {
          shop,
          productId,
          lastInventory: inventory,
          lastObservedAt: now,
        },
        update: {
          lastInventory: inventory,
          lastObservedAt: now,
        },
      }),
    );

    return {
      productId,
      lowStock: false,
      delivered: false,
      reason: "above-threshold",
      inventory,
      threshold: setting.threshold,
    };
  }

  const hosted = getAppEnvironment() !== "development";
  const emailEntitled = optionIds.includes(PHASE6_OPTION_IDS.lowStockEmail);
  const slackEntitled = optionIds.includes(PHASE6_OPTION_IDS.slackAlerts);
  const emailRecipients = normalizeEmailRecipients(setting.emailRecipients);

  const emailDue =
    setting.emailEnabled &&
    emailEntitled &&
    emailRecipients.length > 0 &&
    channelDue(
      state?.lastEmailAlertAt,
      firstLowObservation,
      setting.cooldownMinutes,
      now,
    );

  const slackDue =
    setting.slackEnabled &&
    slackEntitled &&
    Boolean(setting.slackWebhookCiphertext) &&
    channelDue(
      state?.lastSlackAlertAt,
      firstLowObservation,
      setting.cooldownMinutes,
      now,
    );

  const channels = {
    email: {
      enabled: setting.emailEnabled,
      entitled: emailEntitled,
      due: emailDue,
      attempted: false,
      delivered: false,
      error: null as string | null,
    },
    slack: {
      enabled: setting.slackEnabled,
      entitled: slackEntitled,
      due: slackDue,
      attempted: false,
      delivered: false,
      error: null as string | null,
    },
  };

  let emailAttemptedAt: Date | null = null;
  let slackAttemptedAt: Date | null = null;

  if (hosted && emailDue) {
    channels.email.attempted = true;
    emailAttemptedAt = now;
    try {
      await sendEmailAlerts(
        context,
        emailRecipients,
        product,
        inventory,
        setting.threshold,
      );
      channels.email.delivered = true;
    } catch (error) {
      channels.email.error =
        error instanceof Error ? error.message : "Email delivery failed.";
    }
  }

  if (hosted && slackDue && setting.slackWebhookCiphertext) {
    channels.slack.attempted = true;
    slackAttemptedAt = now;
    try {
      await sendSlackAlert(
        setting.slackWebhookCiphertext,
        shop,
        product,
        inventory,
        setting.threshold,
      );
      channels.slack.delivered = true;
    } catch (error) {
      channels.slack.error =
        error instanceof Error ? error.message : "Slack delivery failed.";
    }
  }

  await withPrismaClient((db) =>
    db.lowStockAlertState.upsert({
      where: { shop_productId: { shop, productId } },
      create: {
        shop,
        productId,
        lastInventory: inventory,
        lastObservedAt: now,
        lastEmailAlertAt: emailAttemptedAt,
        lastSlackAlertAt: slackAttemptedAt,
      },
      update: {
        lastInventory: inventory,
        lastObservedAt: now,
        ...(emailAttemptedAt
          ? { lastEmailAlertAt: emailAttemptedAt }
          : {}),
        ...(slackAttemptedAt
          ? { lastSlackAlertAt: slackAttemptedAt }
          : {}),
      },
    }),
  );

  await recordActivityEventSafe({
    shop,
    category: "alerts",
    action: hosted
      ? "alerts.low_stock_processed"
      : "alerts.low_stock_evaluated_local",
    outcome:
      channels.email.error || channels.slack.error
        ? "ERROR"
        : "SUCCESS",
    source: hosted ? "low-stock-alerts" : "low-stock-alerts-local",
    entityType: "product",
    entityId: productId,
    summary: hosted
      ? "Low-stock notification channels evaluated."
      : "Low-stock state evaluated locally without external delivery.",
    details: {
      inventory,
      threshold: setting.threshold,
      firstLowObservation,
      hosted,
      email: {
        enabled: channels.email.enabled,
        entitled: channels.email.entitled,
        due: channels.email.due,
        attempted: channels.email.attempted,
        delivered: channels.email.delivered,
        error: channels.email.error,
      },
      slack: {
        enabled: channels.slack.enabled,
        entitled: channels.slack.entitled,
        due: channels.slack.due,
        attempted: channels.slack.attempted,
        delivered: channels.slack.delivered,
        error: channels.slack.error,
      },
    },
  });

  return {
    productId,
    lowStock: true,
    delivered:
      channels.email.delivered || channels.slack.delivered,
    hosted,
    inventory,
    threshold: setting.threshold,
    firstLowObservation,
    channels,
  };
}
