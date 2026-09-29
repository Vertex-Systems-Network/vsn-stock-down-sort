import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);

  if (shop) {
    await db.collectionSetting.deleteMany({ where: { shop } });
  }

  return new Response();
}
