export type AppEnvironment = "development" | "staging" | "production";

export function getAppEnvironment(): AppEnvironment {
  const configured = process.env.APP_ENV?.trim().toLowerCase();

  if (
    configured === "development" ||
    configured === "staging" ||
    configured === "production"
  ) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function isBillingTestMode() {
  const configured = process.env.SHOPIFY_BILLING_TEST_MODE
    ?.trim()
    .toLowerCase();

  if (["true", "1", "yes"].includes(configured || "")) {
    return true;
  }

  if (["false", "0", "no"].includes(configured || "")) {
    return false;
  }

  return getAppEnvironment() !== "production";
}

export function getDatabaseMode() {
  return "postgresql";
}
