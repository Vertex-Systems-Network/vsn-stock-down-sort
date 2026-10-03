export const PHASE7_OPTION_IDS = Object.freeze({
  markets: "OPT-MARKETS",
  b2bCatalogs: "OPT-B2B-CATALOGS",
  salesChannelRules: "OPT-SALES-CHANNEL-RULES",
} as const);

export const ENTERPRISE_OPTIONAL_SCOPES = Object.freeze({
  publications: "write_publications",
  markets: "read_markets",
  companies: "read_companies",
} as const);

export const MAX_COMMERCE_PUBLICATION_TARGETS = 25;

export type CommerceTargetType = "MARKET" | "B2B" | "CHANNEL";

export type CommercePublicationTarget = {
  publicationId: string;
  type: CommerceTargetType;
};

export type CommercePublicationTargetOption = CommercePublicationTarget & {
  label: string;
  autoPublish: boolean;
};

export type CommerceVisibilityInput = {
  enabled: boolean;
  autoRepublish: boolean;
  targets: CommercePublicationTarget[];
};

function validPublicationId(value: string) {
  return /^gid:\/\/shopify\/Publication\/[^/]+$/.test(value);
}

export function targetValue(target: CommercePublicationTarget) {
  return `${target.type}|${target.publicationId}`;
}

export function parseTargetValue(value: unknown): CommercePublicationTarget {
  const raw = String(value ?? "").trim();
  const separator = raw.indexOf("|");
  if (separator <= 0) throw new Error("Invalid enterprise publication target.");

  const type = raw.slice(0, separator) as CommerceTargetType;
  const publicationId = raw.slice(separator + 1);

  if (!["MARKET", "B2B", "CHANNEL"].includes(type)) {
    throw new Error("Unsupported enterprise publication target type.");
  }
  if (!validPublicationId(publicationId)) {
    throw new Error("Invalid Shopify publication ID.");
  }

  return { type, publicationId };
}

export function normalizeCommerceTargets(values: unknown[]) {
  const unique = new Map<string, CommercePublicationTarget>();

  for (const value of values) {
    const target = parseTargetValue(value);
    unique.set(target.publicationId, target);
  }

  const targets = [...unique.values()];
  if (targets.length > MAX_COMMERCE_PUBLICATION_TARGETS) {
    throw new Error(
      `Select at most ${MAX_COMMERCE_PUBLICATION_TARGETS} publication targets.`,
    );
  }

  return targets;
}

export function parseStoredCommerceTargets(value: string | null | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return normalizeCommerceTargets(
      parsed.map((target) => {
        if (!target || typeof target !== "object") return "";
        const candidate = target as Partial<CommercePublicationTarget>;
        return `${candidate.type ?? ""}|${candidate.publicationId ?? ""}`;
      }),
    );
  } catch {
    return [];
  }
}

export function serializeCommerceTargets(targets: CommercePublicationTarget[]) {
  return JSON.stringify(
    normalizeCommerceTargets(targets.map(targetValue)),
  );
}

export function requiredOptionalScopes(
  targets: readonly CommercePublicationTarget[],
) {
  const scopes = new Set<string>();
  if (targets.length) scopes.add(ENTERPRISE_OPTIONAL_SCOPES.publications);

  for (const target of targets) {
    if (target.type === "MARKET") {
      scopes.add(ENTERPRISE_OPTIONAL_SCOPES.markets);
    } else if (target.type === "B2B") {
      scopes.add(ENTERPRISE_OPTIONAL_SCOPES.companies);
    }
  }

  return [...scopes];
}

export function missingOptionalScopes(
  targets: readonly CommercePublicationTarget[],
  grantedScopes: readonly string[],
) {
  const granted = new Set(grantedScopes);
  return requiredOptionalScopes(targets).filter(
    (scope) => !granted.has(scope),
  );
}

export function assertCommerceEntitlements(
  targets: readonly CommercePublicationTarget[],
  optionIds: readonly string[],
) {
  for (const target of targets) {
    const requiredOption =
      target.type === "MARKET"
        ? PHASE7_OPTION_IDS.markets
        : target.type === "B2B"
          ? PHASE7_OPTION_IDS.b2bCatalogs
          : PHASE7_OPTION_IDS.salesChannelRules;

    if (!optionIds.includes(requiredOption)) {
      throw new Error(
        `Your current plan does not include ${target.type.toLowerCase()} publication rules.`,
      );
    }
  }
}

export function normalizeCommerceVisibilityInput(
  input: {
    enabled?: unknown;
    autoRepublish?: unknown;
    targetValues?: unknown[];
  },
): CommerceVisibilityInput {
  const targets = normalizeCommerceTargets(input.targetValues ?? []);
  const enabled = input.enabled === true;

  if (enabled && targets.length === 0) {
    throw new Error(
      "Select at least one publication target before enabling enterprise rules.",
    );
  }

  return {
    enabled,
    autoRepublish: input.autoRepublish !== false,
    targets,
  };
}
