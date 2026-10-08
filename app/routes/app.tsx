import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getCurrentSubscription } from "../services/billing.server";
import { getAppEnvironment } from "../environment.server";
import { Workspace } from "../components/Workspace";
import { BrandButton, BrandNotice } from "../components/BrandUi";
import { PUBLICATION_SCOPES } from "../services/shopify-scopes";
import "../styles/workspace.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, scopes, redirect: shopifyRedirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const grantedScopes = await scopes.query();
  const missingPublicationScopes = PUBLICATION_SCOPES.filter(
    (scope) => !grantedScopes.granted.includes(scope),
  );
  const authParams = new URLSearchParams();
  for (const key of ["shop", "host", "embedded"]) {
    const value = url.searchParams.get(key);
    if (value) authParams.set(key, value);
  }
  const reauthorizationAction = "/app/permissions" + (authParams.size ? "?" + authParams.toString() : "");
  const billingRoute =
    url.pathname.startsWith("/app/plans") ||
    url.pathname.startsWith("/app/api/subscription");

  if (!billingRoute) {
    const subscription = await getCurrentSubscription(admin);

    if (!subscription) {
      return shopifyRedirect("/app/plans");
    }
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    environment: getAppEnvironment(),
    missingPublicationScopes,
    reauthorizationAction,
  };
};

export default function App() {
  const { apiKey, environment, missingPublicationScopes, reauthorizationAction } =
    useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Collections
        </Link>
      </NavMenu>
      <Workspace
        appName="VSN | Stock Down Sort"
        environment={environment}
      >
        {missingPublicationScopes.length > 0 ? (
          <BrandNotice
            tone="warning"
            heading="Catalog access needs approval"
            className="vsn-publication-permission-notice"
          >
            <p>
              Enable collection publishing by granting the requested Shopify
              permissions. Shopify will ask you to approve them. Your staff
              account must also be allowed to manage the relevant catalogs and
              publications.
            </p>
            <ul>
              {missingPublicationScopes.map((scope) => (
                <li key={scope}><code>{scope}</code></li>
              ))}
            </ul>
            <Form method="post" action={reauthorizationAction} reloadDocument>
              <BrandButton type="submit" variant="primary">
                Authorize Shopify access
              </BrandButton>
            </Form>
          </BrandNotice>
        ) : null}
        <Outlet />
      </Workspace>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so their headers are included.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
