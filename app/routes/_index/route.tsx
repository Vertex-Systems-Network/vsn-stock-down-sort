import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function IndexPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded={false}>
      <s-page heading="VSN Stock Down Sort">
        <s-section heading="Keep available products first">
          <s-stack gap="base">
            <s-text>
              Automatically keep sold-out products below available items, apply
              collection-specific sorting rules, and keep your catalog organized
              as inventory changes.
            </s-text>

            <s-stack direction="inline" gap="small-200">
              <s-badge tone="success">Automatic stock sorting</s-badge>
              <s-badge tone="info">Custom collection rules</s-badge>
              <s-badge tone="info">Real-time inventory updates</s-badge>
            </s-stack>
          </s-stack>
        </s-section>

        {showForm ? (
          <s-section heading="Open the app">
            <Form method="post" action="/auth/login">
              <s-stack gap="base">
                <s-text-field
                  name="shop"
                  label="Shop domain"
                  details="example.myshopify.com"
                  autocomplete="on"
                  required
                />
                <s-button type="submit" variant="primary">
                  Log in with Shopify
                </s-button>
              </s-stack>
            </Form>
          </s-section>
        ) : null}

        <s-section heading="What you can manage">
          <s-grid
            gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
            gap="base"
          >
            <s-box border="base base solid" borderRadius="large" padding="base">
              <s-stack gap="small-200">
                <s-heading>Collection sorting</s-heading>
                <s-text>
                  Push sold-out products down, pin priority products, exclude
                  selected items, and control in-stock ordering.
                </s-text>
              </s-stack>
            </s-box>

            <s-box border="base base solid" borderRadius="large" padding="base">
              <s-stack gap="small-200">
                <s-heading>Automation</s-heading>
                <s-text>
                  Re-sort from inventory changes, schedules, and rule-based
                  automation without manual collection maintenance.
                </s-text>
              </s-stack>
            </s-box>

            <s-box border="base base solid" borderRadius="large" padding="base">
              <s-stack gap="small-200">
                <s-heading>Visibility & monitoring</s-heading>
                <s-text>
                  Manage sold-out visibility, alerts, analytics, activity
                  history, and supported commerce contexts from Shopify Admin.
                </s-text>
              </s-stack>
            </s-box>
          </s-grid>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
