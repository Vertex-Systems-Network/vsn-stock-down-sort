import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useLocation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { getCurrentSubscription } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const billingRoute =
    url.pathname.startsWith("/app/plans") ||
    url.pathname.startsWith("/app/api/subscription");

  if (!billingRoute) {
    const subscription = await getCurrentSubscription(admin);

    if (!subscription) {
      const params = new URLSearchParams();
      const shop = url.searchParams.get("shop");
      const host = url.searchParams.get("host");

      if (shop) params.set("shop", shop);
      if (host) params.set("host", host);

      const query = params.toString();
      throw redirect(`/app/plans${query ? `?${query}` : ""}`);
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href={`/app${location.search}`}>Collections</s-link>
        <s-link href={`/app/plans${location.search}`}>Plans</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
