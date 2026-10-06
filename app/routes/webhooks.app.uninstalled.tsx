import type { ActionFunctionArgs } from "react-router";
import { logShopDataPurgeFailure } from "../services/webhook-diagnostics.server";
import { purgeShopData } from "../services/shop-data.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);

  if (shop) {
    try {
      await purgeShopData(shop);
    } catch (error) {
      logShopDataPurgeFailure(request, "app/uninstalled", error);
      throw error;
    }
  }

  return new Response(null, { status: 200 });
}
