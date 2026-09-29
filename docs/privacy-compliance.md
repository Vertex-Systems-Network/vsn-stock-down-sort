# Shopify privacy and compliance

VSN Stock Down Sort is designed for Shopify App Store distribution.

## Data stored by the app

The app does not persist Shopify customer or order records.

It stores only the data required to operate the app:

- Shopify authentication/session records for an installed shop;
- collection IDs and collection sorting settings;
- last-sort status/error metadata.

## Mandatory compliance webhooks

All Local/Dev, Staging, and Live Shopify configurations subscribe to:

- `customers/data_request`;
- `customers/redact`;
- `shop/redact`.

The customer-level compliance endpoints authenticate Shopify's signed webhook
and acknowledge it. There is no persisted customer/order record to export or
redact.

The `shop/redact` endpoint removes all persisted session and collection
setting rows for the shop. The `app/uninstalled` handler performs the same
cleanup immediately so revoked access tokens and stale collection settings are
not retained.

## API version

As of September 29, 2026, the app pins webhook configuration to Shopify
`2026-07`, the latest stable API version. The `2026-10` release remains a
release candidate until October 1, 2026 and is not used by the production
configuration before it becomes stable.

The server runtime also uses Shopify's July 2026 Admin API version, so runtime
and webhook configuration stay aligned.
