export const PHASE8_OPTION_IDS = Object.freeze({
  apiIntegrations: "OPT-API-INTEGRATIONS",
} as const);

export const INTEGRATION_SCOPES = Object.freeze([
  "activity:read",
  "collections:sort",
  "automation:run",
  "webhooks:sort",
] as const);

export type IntegrationScope =
  (typeof INTEGRATION_SCOPES)[number];

export function normalizeIntegrationScopes(values: unknown[]) {
  const normalized = [
    ...new Set(
      values
        .flatMap((value) => String(value ?? "").split(/[\s,]+/))
        .map((value) => value.trim())
        .filter(
          (value): value is IntegrationScope =>
            INTEGRATION_SCOPES.includes(value as IntegrationScope),
        ),
    ),
  ];

  return normalized.sort();
}

export function parseIntegrationScopes(value: string) {
  return normalizeIntegrationScopes([value]);
}

export function assertApiIntegrationEntitlement(
  optionIds: readonly string[],
) {
  if (!optionIds.includes(PHASE8_OPTION_IDS.apiIntegrations)) {
    throw new Error(
      "Your current plan does not include API and webhook integrations.",
    );
  }
}
