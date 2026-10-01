# VSN Stock Down Sort

Existing Shopify application that keeps available products ahead of sold-out products in enabled collections.

## Current product contract
- Four stable plan IDs: `starter`, `growth`, `pro`, `unlimited`
- Prices every 30 days: USD 10.99 / 19.99 / 34.99 / 54.99
- 10-day free trial on each current paid plan
- Unlimited products on every plan
- Unlimited collections on every plan
- Automatic sold-out product sorting
- Re-sorting after inventory/product updates
- Manual Sort Now
- Bulk enable/disable
- Previous sort-order restore support
- 24/7 support
- Capability-based plan differentiation; unimplemented capabilities must fail closed
- Existing legacy USD 55 / 5-day subscriptions remain recognized only for compatibility until an approved merchant plan change

## Environment contract
- Local/Dev app: `VSN | Stock Down Sort Dev`
- Staging app: `VSN | Stock Down Sort Staging`
- Production app: `VSN | Stock Down Sort`
- Promotion order: Local/Dev → Staging → Live
- Missing runtime acceptance evidence blocks promotion

## Adoption note
This is an existing product. ANPOS must audit and improve the current implementation rather than replace it with a greenfield design.
