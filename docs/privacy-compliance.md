# Shopify privacy and compliance

VSN Stock Down Sort is designed for Shopify App Store distribution.

## Protected customer data position

The app does **not** request Shopify customer or order scopes and does not persist Shopify customer or order records.

Current application scopes are limited to product, inventory, location, and publication functionality:

- `read_products`
- `write_products`
- `read_inventory`
- `read_locations`
- `read_publications`
- `write_publications`

The Partner Dashboard protected-customer-data declaration must still be completed truthfully during submission. Repository evidence supports an opt-out/no-customer-data position unless the app's scopes or behavior change before submission.

## Data stored by the app

The app stores only data needed to operate the installed shop's configured features:

- Shopify authentication/session records, including token/session metadata and optional authenticated admin-user fields provided by Shopify session storage;
- collection IDs, enablement state, previous sort mode, exclusions, pinned-product IDs, inventory mode/location selections, and sort status/error metadata;
- product and variant visibility configuration and app-owned restore state;
- shop-scoped activity history and automation-rule state;
- low-stock alert configuration, recipient strings, alert cooldown/observation state, and encrypted Slack webhook configuration;
- Markets/B2B/sales-channel visibility rule and restore state;
- API integration credential metadata, token hashes, encrypted webhook secrets, rate-limit state, and replay-nonce hashes;
- support requests submitted through the app.

The app does not use these records as Shopify customer/order profiles.

## Mandatory compliance webhooks

All Local/Dev, Staging, and Live Shopify configurations subscribe to:

- `customers/data_request`;
- `customers/redact`;
- `shop/redact`.

The customer-level compliance endpoints authenticate Shopify's signed webhook and acknowledge it. Because the app does not persist Shopify customer/order records, there is no customer-scoped application record to export or redact.

The `shop/redact` endpoint calls `purgeShopData(shop)`, which deletes every current Prisma model that owns a `shop` field. It also removes replay nonces linked to the shop's integration credentials. The `app/uninstalled` handler performs the same purge immediately so revoked sessions, configuration, history, integrations, alert state, and support records are not retained by the app.

The regression contract derives shop-scoped model names from `prisma/cloud/schema.prisma`; adding a future model with a `shop` field without adding a purge path causes App Validation to fail.

## API version

The Live configuration and server runtime currently pin Shopify Admin/webhook API version `2026-07`. This is an explicit supported-version pin; the project does not claim that it is the newest stable version.

Any future API-version upgrade must update the runtime, Local/Staging/Live Shopify configuration, contracts, and release evidence together so webhook and Admin API behavior remain aligned.
