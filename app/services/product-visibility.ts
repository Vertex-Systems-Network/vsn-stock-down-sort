export const PHASE3_OPTION_IDS = Object.freeze({
  autoHideProducts: "OPT-AUTO-HIDE-PRODUCTS",
  autoRepublish: "OPT-AUTO-REPUBLISH",
  seoSafeHide: "OPT-SEO-SAFE-HIDE",
  hideSoldOutVariants: "OPT-HIDE-SOLD-OUT-VARIANTS",
  variantRestore: "OPT-VARIANT-RESTORE",
} as const);

export const PRODUCT_VISIBILITY_MODES = Object.freeze([
  "OFF",
  "DRAFT",
  "UNLISTED",
] as const);

export type ProductVisibilityMode =
  (typeof PRODUCT_VISIBILITY_MODES)[number];

export function parseProductVisibilityMode(
  value: string | null | undefined,
): ProductVisibilityMode {
  return PRODUCT_VISIBILITY_MODES.includes(value as ProductVisibilityMode)
    ? (value as ProductVisibilityMode)
    : "OFF";
}
