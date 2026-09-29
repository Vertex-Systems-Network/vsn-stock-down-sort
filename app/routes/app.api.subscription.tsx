import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  cancelSubscription,
  createProSubscription,
  getAnyActiveSubscription,
  getCurrentSubscription,
} from "../services/billing.server";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const subscription = await getCurrentSubscription(admin);

    return Response.json({
      ok: true,
      shop: session.shop,
      subscription,
      environment: getAppEnvironment(),
      billingTestMode: isBillingTestMode(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        subscription: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read subscription status.",
      },
      { status: 500 },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { ok: false, error: "Method not allowed." },
      { status: 405, headers: { Allow: "POST" } },
    );
  }

  const formData = await request.formData();
  const actionType = String(formData.get("actionType") || "");

  try {
    const [currentSubscription, activeSubscription] = await Promise.all([
      getCurrentSubscription(admin),
      getAnyActiveSubscription(admin),
    ]);

    if (actionType === "create") {
      if (activeSubscription) {
        return Response.json(
          {
            ok: false,
            error: "An active subscription already exists for this shop.",
          },
          { status: 409 },
        );
      }

      const appUrl = process.env.SHOPIFY_APP_URL;

      if (!appUrl) {
        return Response.json(
          { ok: false, error: "SHOPIFY_APP_URL is not configured." },
          { status: 500 },
        );
      }

      const returnUrl = new URL("/app/plans", appUrl);
      returnUrl.searchParams.set("shop", session.shop);

      const host = String(formData.get("host") || "");
      if (host) {
        returnUrl.searchParams.set("host", host);
      }

      const result = await createProSubscription(admin, returnUrl.toString());

      return Response.json({
        ok: true,
        confirmationUrl: result.confirmationUrl,
      });
    }

    if (actionType === "cancel") {
      const subscriptionId = String(formData.get("id") || "");

      if (!subscriptionId) {
        return Response.json(
          { ok: false, error: "Subscription ID is required." },
          { status: 400 },
        );
      }

      if (
        !activeSubscription ||
        activeSubscription.id !== subscriptionId ||
        activeSubscription.status !== "ACTIVE"
      ) {
        return Response.json(
          { ok: false, error: "Active subscription not found." },
          { status: 404 },
        );
      }

      const subscription = await cancelSubscription(admin, subscriptionId);

      return Response.json({
        ok: true,
        cancelled: true,
        subscription,
      });
    }

    return Response.json(
      { ok: false, error: "Unknown subscription action." },
      { status: 400 },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Shopify subscription request failed.",
      },
      { status: 500 },
    );
  }
}
