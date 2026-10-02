export const PHASE2_OPTION_IDS = Object.freeze({
  exclusions: "OPT-TAG-EXCLUSIONS",
  pinnedProducts: "OPT-PINNED-PRODUCTS",
  advancedSort: "OPT-ADVANCED-SORT-RULES",
  multiLocation: "OPT-MULTI-LOCATION",
} as const);

export const AVAILABLE_SORT_MODES = Object.freeze([
  "PRESERVE",
  "TITLE_ASC",
  "TITLE_DESC",
  "INVENTORY_DESC",
  "INVENTORY_ASC",
  "NEWEST",
  "OLDEST",
] as const);

export const INVENTORY_MODES = Object.freeze([
  "ALL_LOCATIONS",
  "ANY_SELECTED_LOCATION",
  "ALL_SELECTED_LOCATIONS",
] as const);

export type AvailableSortMode = (typeof AVAILABLE_SORT_MODES)[number];
export type InventoryMode = (typeof INVENTORY_MODES)[number];

export type CollectionRuleInput = {
  excludedTags: string;
  excludedVendors: string;
  excludedProducts: string;
  pinnedProducts: string;
  availableSortMode: AvailableSortMode;
  inventoryMode: InventoryMode;
  inventoryLocationIds: string;
};

type StoredRulesLike = {
  excludedTags?: string | null;
  excludedVendors?: string | null;
  excludedProducts?: string | null;
  pinnedProducts?: string | null;
  availableSortMode?: string | null;
  inventoryMode?: string | null;
  inventoryLocationIds?: string | null;
};

const MAX_RULE_ITEMS = 500;
const MAX_RULE_ITEM_LENGTH = 255;

function uniqueTrimmed(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    if (value.length > MAX_RULE_ITEM_LENGTH) {
      throw new Error(
        `Rule value exceeds ${MAX_RULE_ITEM_LENGTH} characters: ${value.slice(0, 40)}…`,
      );
    }

    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  if (result.length > MAX_RULE_ITEMS) {
    throw new Error(`A maximum of ${MAX_RULE_ITEMS} values is allowed per rule field.`);
  }

  return result;
}

export function parseRuleList(value: string | null | undefined) {
  if (!value) return [];
  return uniqueTrimmed(value.split(/[\n,]+/g));
}

export function normalizeRuleList(value: string | null | undefined) {
  return parseRuleList(value).join("\n");
}

export function parseAvailableSortMode(value: string | null | undefined) {
  return AVAILABLE_SORT_MODES.includes(value as AvailableSortMode)
    ? (value as AvailableSortMode)
    : "PRESERVE";
}

export function parseInventoryMode(value: string | null | undefined) {
  return INVENTORY_MODES.includes(value as InventoryMode)
    ? (value as InventoryMode)
    : "ALL_LOCATIONS";
}

export function normalizeCollectionRuleInput(
  input: Partial<Record<keyof CollectionRuleInput, string | null | undefined>>,
): CollectionRuleInput {
  const inventoryMode = parseInventoryMode(input.inventoryMode);
  const inventoryLocationIds =
    inventoryMode === "ALL_LOCATIONS"
      ? ""
      : normalizeRuleList(input.inventoryLocationIds);

  if (
    inventoryMode !== "ALL_LOCATIONS" &&
    parseRuleList(inventoryLocationIds).length === 0
  ) {
    throw new Error(
      "Choose at least one Shopify location for a selected-location inventory rule.",
    );
  }

  return {
    excludedTags: normalizeRuleList(input.excludedTags),
    excludedVendors: normalizeRuleList(input.excludedVendors),
    excludedProducts: normalizeRuleList(input.excludedProducts),
    pinnedProducts: normalizeRuleList(input.pinnedProducts),
    availableSortMode: parseAvailableSortMode(input.availableSortMode),
    inventoryMode,
    inventoryLocationIds,
  };
}

export function assertCollectionRuleEntitlements(
  rules: CollectionRuleInput,
  entitledOptionIds: readonly string[],
) {
  const allowed = new Set(entitledOptionIds);

  if (
    (rules.excludedTags ||
      rules.excludedVendors ||
      rules.excludedProducts) &&
    !allowed.has(PHASE2_OPTION_IDS.exclusions)
  ) {
    throw new Error("Your current plan does not include exclusion rules.");
  }

  if (
    rules.pinnedProducts &&
    !allowed.has(PHASE2_OPTION_IDS.pinnedProducts)
  ) {
    throw new Error("Your current plan does not include pinned products.");
  }

  if (
    rules.availableSortMode !== "PRESERVE" &&
    !allowed.has(PHASE2_OPTION_IDS.advancedSort)
  ) {
    throw new Error("Your current plan does not include advanced sorting.");
  }

  if (
    rules.inventoryMode !== "ALL_LOCATIONS" &&
    !allowed.has(PHASE2_OPTION_IDS.multiLocation)
  ) {
    throw new Error(
      "Your current plan does not include multi-location inventory rules.",
    );
  }
}

export function effectiveCollectionRules(
  stored: StoredRulesLike | null | undefined,
  entitledOptionIds: readonly string[],
): CollectionRuleInput {
  const allowed = new Set(entitledOptionIds);

  return {
    excludedTags: allowed.has(PHASE2_OPTION_IDS.exclusions)
      ? normalizeRuleList(stored?.excludedTags)
      : "",
    excludedVendors: allowed.has(PHASE2_OPTION_IDS.exclusions)
      ? normalizeRuleList(stored?.excludedVendors)
      : "",
    excludedProducts: allowed.has(PHASE2_OPTION_IDS.exclusions)
      ? normalizeRuleList(stored?.excludedProducts)
      : "",
    pinnedProducts: allowed.has(PHASE2_OPTION_IDS.pinnedProducts)
      ? normalizeRuleList(stored?.pinnedProducts)
      : "",
    availableSortMode: allowed.has(PHASE2_OPTION_IDS.advancedSort)
      ? parseAvailableSortMode(stored?.availableSortMode)
      : "PRESERVE",
    inventoryMode: allowed.has(PHASE2_OPTION_IDS.multiLocation)
      ? parseInventoryMode(stored?.inventoryMode)
      : "ALL_LOCATIONS",
    inventoryLocationIds: allowed.has(PHASE2_OPTION_IDS.multiLocation)
      ? normalizeRuleList(stored?.inventoryLocationIds)
      : "",
  };
}

export function hasEntitlement(
  entitledOptionIds: readonly string[],
  optionId: string,
) {
  return entitledOptionIds.includes(optionId);
}
