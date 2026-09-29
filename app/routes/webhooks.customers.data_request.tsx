import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * This app doesn't persist Shopify customer or order records.
 * Authentication still verifies Shopify's HMAC before acknowledging the
 * mandatory data-request webhook.
 */
export async function action({ request }: ActionFunctionArgs) {
  await authenticate.webhook(request);
  return new Response(null, { status: 200 });
}
