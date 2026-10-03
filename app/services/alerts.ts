export const PHASE6_OPTION_IDS = Object.freeze({
  lowStockEmail: "OPT-LOW-STOCK-EMAIL",
  slackAlerts: "OPT-SLACK-ALERTS",
} as const);

export const ALERT_COOLDOWN_MINUTES = Object.freeze([
  60,
  360,
  720,
  1440,
] as const);

export type AlertSettingInput = {
  threshold: number;
  cooldownMinutes: number;
  emailEnabled: boolean;
  emailRecipients: string;
  slackEnabled: boolean;
};

function parseInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}.`);
  }
  return parsed;
}

export function normalizeEmailRecipients(value: unknown) {
  const raw = String(value ?? "");
  const unique = [
    ...new Set(
      raw
        .split(/[\n,;]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  if (unique.length > 10) {
    throw new Error("At most 10 email recipients are supported.");
  }

  for (const email of unique) {
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new Error(`Invalid email recipient: ${email}`);
    }
  }

  return unique;
}

export function normalizeAlertSettingInput(
  input: Partial<Record<keyof AlertSettingInput, unknown>>,
): AlertSettingInput {
  const cooldownMinutes = parseInteger(
    input.cooldownMinutes,
    360,
    ALERT_COOLDOWN_MINUTES[0],
    ALERT_COOLDOWN_MINUTES[ALERT_COOLDOWN_MINUTES.length - 1],
  );

  if (
    !ALERT_COOLDOWN_MINUTES.includes(
      cooldownMinutes as (typeof ALERT_COOLDOWN_MINUTES)[number],
    )
  ) {
    throw new Error("Unsupported alert cooldown.");
  }

  return {
    threshold: parseInteger(input.threshold, 5, 0, 1000000),
    cooldownMinutes,
    emailEnabled: input.emailEnabled === true,
    emailRecipients: normalizeEmailRecipients(input.emailRecipients).join("\n"),
    slackEnabled: input.slackEnabled === true,
  };
}

export function assertAlertEntitlements(
  input: Pick<AlertSettingInput, "emailEnabled" | "slackEnabled">,
  optionIds: readonly string[],
) {
  if (
    input.emailEnabled &&
    !optionIds.includes(PHASE6_OPTION_IDS.lowStockEmail)
  ) {
    throw new Error(
      "Your current plan does not include low-stock email alerts.",
    );
  }

  if (
    input.slackEnabled &&
    !optionIds.includes(PHASE6_OPTION_IDS.slackAlerts)
  ) {
    throw new Error("Your current plan does not include Slack alerts.");
  }
}

export function normalizeSlackWebhookUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Slack webhook URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Slack webhook URL must use HTTPS.");
  }

  const allowedHosts = new Set([
    "hooks.slack.com",
    "hooks.slack-gov.com",
  ]);

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Slack webhook host is not allowed.");
  }

  if (!/^\/services\/[^/]+\/[^/]+\/[^/?#]+$/.test(url.pathname)) {
    throw new Error("Slack incoming webhook path is invalid.");
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}
