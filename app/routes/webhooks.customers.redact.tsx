import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * This app doesn't persist Shopify customer or order records, so there is no
 * customer-scoped record to redact. Authentication verifies the Shopify HMAC.
 */
export async function action({ request }: ActionFunctionArgs) {
  await authenticate.webhook(request);
  return new Response(null, { status: 200 });
}
