import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import type { PlanId } from "../billing-config";
import {
  cancelSubscription,
  createSubscription,
  getAnyActiveSubscription,
  getCurrentSubscriptionPlan,
  describeShopifyBillingError,
  getEmbeddedAdminBillingReturnUrl,
  getShopifyBillingErrorDiagnostic,
} from "../services/billing.server";
import { getAppEnvironment, isBillingTestMode } from "../environment.server";

function isPlanId(value: string): value is PlanId {
  return value === "starter" || value === "growth" || value === "pro" || value === "unlimited";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  try {
    const current = await getCurrentSubscriptionPlan(admin);

    return Response.json({
      ok: true,
      shop: session.shop,
      subscription: current?.subscription ?? null,
      planId: current?.plan.id ?? null,
      planSource: current?.source ?? null,
      environment: getAppEnvironment(),
      billingTestMode: isBillingTestMode(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        subscription: null,
        planId: null,
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
    const activeSubscription = await getAnyActiveSubscription(admin);
    const current = await getCurrentSubscriptionPlan(admin);

    if (actionType === "subscribe" || actionType === "create") {
      const requestedPlanId = String(
        formData.get("planId") || (actionType === "create" ? "unlimited" : ""),
      );

      if (!isPlanId(requestedPlanId)) {
        return Response.json(
          { ok: false, error: "A valid plan ID is required." },
          { status: 400 },
        );
      }

      if (current?.plan.id === requestedPlanId) {
        return Response.json(
          { ok: false, error: "This plan is already active." },
          { status: 409 },
        );
      }

      if (activeSubscription && !current) {
        return Response.json(
          {
            ok: false,
            error:
              "An active subscription exists but does not match an approved VSN plan. Review it before changing plans.",
          },
          { status: 409 },
        );
      }

      const returnUrl = await getEmbeddedAdminBillingReturnUrl(
        admin,
        session.shop,
      );

      const result = await createSubscription(
        admin,
        requestedPlanId,
        returnUrl,
      );

      const confirmation = new URL(result.confirmationUrl);
      console.info("[billing] subscription confirmation created", {
        shop: session.shop,
        currentPlanId: current?.plan.id ?? null,
        requestedPlanId,
        confirmationHost: confirmation.host,
        confirmationPath: confirmation.pathname,
      });

      return Response.json({
        ok: true,
        confirmationUrl: result.confirmationUrl,
        planId: requestedPlanId,
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
          { ok: false, error: "Active Shopify subscription not found." },
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
    if (error instanceof Response) {
      throw error;
    }

    const message = await describeShopifyBillingError(error);
    const diagnostic = getShopifyBillingErrorDiagnostic(error);
    console.error("[billing] subscription action failed", {
      shop: session.shop,
      actionType,
      message,
      diagnostic,
    });

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

