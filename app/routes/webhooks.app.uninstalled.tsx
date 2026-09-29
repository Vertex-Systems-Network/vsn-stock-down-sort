import type { ActionFunctionArgs } from "react-router";
import { withPrismaClient } from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await authenticate.webhook(request);

  if (shop) {
    await withPrismaClient((db) =>
      db.collectionSetting.deleteMany({ where: { shop } }),
    );
  }

  return new Response();
}
