import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { PUBLICATION_SCOPES } from "../services/shopify-scopes";

/** Request the predeclared optional publication scopes through Shopify consent. */
export async function action({ request }: ActionFunctionArgs) {
  const { scopes } = await authenticate.admin(request);

  // Never accept scope names or redirect targets from the submitted form.
  await scopes.request([...PUBLICATION_SCOPES]);

  const currentUrl = new URL(request.url);
  const authParams = new URLSearchParams();
  for (const key of ["shop", "host", "embedded"]) {
    const value = currentUrl.searchParams.get(key);
    if (value) authParams.set(key, value);
  }
  throw redirect("/app" + (authParams.size ? "?" + authParams.toString() : ""));
}
