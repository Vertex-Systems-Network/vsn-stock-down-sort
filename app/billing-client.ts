type ShopifyBridge = {
  idToken?: () => Promise<string>;
};

export type BillingSubmitResult = {
  ok?: boolean;
  cancelled?: boolean;
  planId?: string;
  confirmationUrl?: string;
  error?: string;
};

function getShopifyBridge() {
  return (window as Window & { shopify?: ShopifyBridge }).shopify;
}

export function validateBillingConfirmation(value: string) {
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "admin.shopify.com" ||
      /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(url.hostname)
    )
  ) {
    throw new Error("Shopify returned an invalid billing confirmation URL.");
  }

  if (
    url.hostname.endsWith(".myshopify.com") &&
    url.pathname.startsWith("/admin/charges/")
  ) {
    const storeHandle = url.hostname.slice(0, -".myshopify.com".length);
    const modernAdminUrl = new URL(
      `https://admin.shopify.com/store/${storeHandle}${url.pathname.slice("/admin".length)}`,
    );
    modernAdminUrl.search = url.search;
    modernAdminUrl.hash = url.hash;
    return modernAdminUrl.href;
  }

  return url.href;
}

export function openBillingConfirmation(value: string) {
  const confirmationUrl = validateBillingConfirmation(value);

  const opened = window.open(confirmationUrl, "_top");

  if (!opened) {
    throw new Error(
      "Shopify plan approval could not open automatically. Use the Continue to Shopify plan approval link.",
    );
  }

  return confirmationUrl;
}

export async function submitBilling(
  formData: FormData,
  search = "",
): Promise<BillingSubmitResult> {
  const shopify = getShopifyBridge();

  if (!shopify?.idToken) {
    throw new Error(
      "Open this app inside Shopify Admin to manage your subscription.",
    );
  }

  const token = await shopify.idToken();
  if (!token) {
    throw new Error(
      "Your Shopify session could not be verified. Reopen the app and try again.",
    );
  }

  const response = await window.fetch(
    `/app/api/subscription${search}`,
    {
      method: "POST",
      body: formData,
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "Shopify authentication interrupted billing. Reopen the app and try again.",
    );
  }

  const result = (await response.json()) as BillingSubmitResult;

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "The billing request failed.");
  }

  if (result.confirmationUrl) {
    result.confirmationUrl = validateBillingConfirmation(result.confirmationUrl);
  }

  return result;
}
