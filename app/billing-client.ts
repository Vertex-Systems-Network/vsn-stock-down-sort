type ShopifyBridge = {
  idToken?: () => Promise<string>;
};

type BillingSubmitResult = {
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

  return url.href;
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
