# Shopify App Store listing and review pack

This is the repository-prepared English submission pack for **VSN | Stock Down Sort**. It only describes implemented functionality. Dashboard entry, screenshots, video, contacts, protected-data declarations, automated checks, and final submission remain external evidence gates.

Canonical machine-readable source: `config/shopify/app-store-listing-pack.json`.

## English listing copy

**App card subtitle**

> Automate sold-out sorting, visibility rules, and stock alerts

**App introduction**

> Keep available products visible first with automated sorting, visibility controls, and stock alerts.

**App details**

> VSN Stock Down Sort keeps available products ahead of sold-out items and gives merchants control over collection sorting, exclusions, pinning, product and variant visibility, automation, alerts, analytics, commerce-context rules, and integrations. Merchants can enable collections individually, run sorting on demand, restore previous sort behavior, and choose capabilities by plan.

**Feature list**

- Push sold-out products below available items automatically
- Re-sort collections when inventory or products change
- Exclude, pin, and manually sort products in collections
- Hide or republish products and sold-out variants automatically
- Schedule automation and send low-stock email or Slack alerts
- Apply inventory rules across locations, markets, and B2B catalogs
- Review activity history, analytics, and CSV exports
- Connect external workflows with secure API integrations

Do not add prices, testimonials, merchant statistics, outcome guarantees, URLs, or keyword stuffing to these listing fields.

## Screenshot capture pack

Capture **6 unique 1600 × 900 screenshots** from the actual Live app. Do not use generated/mock screenshots for the App Store submission.

1. **Collections dashboard** — collection status, per-row actions, Sort now, and product counts.
2. **Collection sorting controls** — exclusions, pinned products, and manual sorting controls.
3. **Product and variant visibility** — hide, republish, SEO-safe visibility, and sold-out variant controls.
4. **Automation rules** — scheduled automation and rule builder.
5. **Inventory alerts** — low-stock email and Slack settings with destinations redacted.
6. **Secure integrations** — API integration controls with all credentials hidden.

For every image:

- crop out browser chrome and the desktop background;
- use a different feature/view/state;
- remove pricing, testimonials, review quotes, guarantees, merchant PII, and credentials;
- provide descriptive alt text;
- do not submit a logo-only screenshot.

Avoid the Plans screen as listing media because pricing belongs in designated pricing fields. Avoid analytics screenshots containing merchant statistics or store performance data.

## Reviewer instructions

Use a Shopify development store with the **Live app** installed. No external service credentials are required for the core path.

Prepare a manual collection with at least one available product and one sold-out product.

1. Install/open **VSN | Stock Down Sort** and confirm the embedded UI loads without a web error.
2. Open **Plans** and select Starter on Shopify's hosted plan-selection page. On a development store owned by the same Partner organization, the paid plan is tested at no charge.
3. Return to `/app`, enable the test collection, and use **Sort now**.
4. Open the collection in Shopify and confirm available products appear ahead of sold-out products.
5. Use **Disable & restore** and confirm the previous Shopify sort behavior can be restored.
6. Verify exclusions and manual sorting controls are interactive.
7. Use Growth or a higher plan when testing visibility automation, schedules, Slack alerts, multi-location rules, analytics, commerce-context rules, or API integrations.
8. Confirm a plan change can be initiated from the Plans page without reinstalling the app.
9. Confirm Help center/support is reachable from the app navigation.

For development-store App Pricing validation, the active subscription's effective recurring price is expected to be **USD 0.00** while Partner historical plan data must still match the configured public catalog price. The canonical public prices remain Starter USD 10.99, Growth USD 19.99, Pro USD 34.99, and Unlimited USD 70.00 with a 10-day trial and monthly billing.

## Demo screencast outline

Target duration: **2–3 minutes**.

- Open/install the Live app and land in the embedded UI.
- Show Shopify-hosted plan selection on a development store.
- Enable a collection and run Sort now.
- Show available-first / sold-out-last order in the collection.
- Show exclusions, pinning, visibility automation, schedules, and alerts.
- Finish at Help center / app home.

Do not expose credentials, customer data, personal information, or private store details.

## External items still pending

- Capture/upload feature media.
- Add a demo store URL and contextual instructions.
- Capture/upload the six actual UI screenshots.
- Record/upload the demo screencast.
- Select the final Shopify category/tag in Partner Dashboard.
- Configure API contact and emergency developer contact.
- Complete protected customer data declaration.
- Run Shopify automated submission checks.
- Submit the Live app for review.
