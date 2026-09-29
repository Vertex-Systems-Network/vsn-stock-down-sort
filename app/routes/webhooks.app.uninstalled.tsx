import type { ActionFunctionArgs } from "react-router";
import { purgeShopData } from "../services/shop-data.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);

  if (shop) {
    await purgeShopData(shop);
  }

  return new Response(null, { status: 200 });
}
