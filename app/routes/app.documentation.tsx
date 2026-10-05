import { Link } from "react-router";
import { PageShell } from "../components/BrandUi";

import {
  BILLING_PLANS,
  getImplementedPlanFeatureNames,
} from "../billing-config";
import { PageIntro } from "../components/Workspace";

type ScreenName =
  | "Collections"
  | "Rules"
  | "Visibility"
  | "Automation"
  | "Alerts"
  | "Analytics"
  | "Contexts"
  | "Integrations"
  | "Plans"
  | "Support";

type Guide = {
  name: string;
  what: string;
  when: string;
  where: string;
  screen: ScreenName;
};

const GUIDES: Guide[] = [
  {
    name: "Unlimited product and collection counts",
    what: "VSN does not add its own product or collection count cap. You can use the app across the catalog without moving to a higher tier because of store size alone.",
    when: "Use it from day one. Plan upgrades are for capabilities, not product-count ceilings.",
    where: "Collections → the collection list and bulk controls.",
    screen: "Collections",
  },
  {
    name: "Sold-out push down",
    what: "Moves unavailable products behind products that can still be purchased while preserving the collection as the shopper-facing merchandising surface.",
    when: "Use this on collections where sold-out items should remain visible but should not occupy prime positions.",
    where: "Collections → Enable beside a collection.",
    screen: "Collections",
  },
  {
    name: "Realtime inventory re-sort",
    what: "Inventory and product updates can re-run the same server-side sorting engine so collection order follows current Shopify stock.",
    when: "Use this when stock changes frequently and manual resorting would be unreliable.",
    where: "Collections → enabled collections; Automation for scheduled workflows.",
    screen: "Collections",
  },
  {
    name: "Restore original position",
    what: "VSN records the previous Shopify sort order when it takes control and can restore that order when automation is disabled.",
    when: "Use this if you want to test automation without permanently losing the previous merchandising order.",
    where: "Collections → Actions → Disable & restore.",
    screen: "Collections",
  },
  {
    name: "Manual and bulk sort controls",
    what: "Run Sort now for one enabled collection, or enable/disable automation across the whole collection set from inside the app.",
    when: "Use manual Sort now after a major catalog change or while validating rules before relying on automatic updates.",
    where: "Collections → collection row or workspace hero controls.",
    screen: "Collections",
  },
  {
    name: "Tag/vendor/product exclusions",
    what: "Excluded products stay fixed instead of being moved by stock-aware automation. You can target tags, vendors, handles, or Shopify product GIDs.",
    when: "Use exclusions for campaign products, manually merchandised hero items, preorders, or products that should never be rearranged.",
    where: "Collections → Rules → Excluded tags/vendors/products.",
    screen: "Rules",
  },
  {
    name: "Low-stock email alerts",
    what: "Tracks live Shopify inventory against your threshold and can notify the configured merchant email when stock becomes low.",
    when: "Use this for products where replenishment or merchandising action should happen before inventory reaches zero.",
    where: "Alerts → email settings and threshold.",
    screen: "Alerts",
  },
  {
    name: "Pinned products",
    what: "Pinned products take priority over the normal available/sold-out ordering. Their order in the pin list determines their priority.",
    when: "Use pins for launches, promoted items, best sellers, or contractual placement requirements.",
    where: "Collections → Rules → Pinned products.",
    screen: "Rules",
  },
  {
    name: "Advanced collection sorting",
    what: "Changes the order of in-stock products using title, inventory quantity, or product age while still pushing sold-out products down.",
    when: "Use this when available-first is not enough and you want a deterministic secondary merchandising rule.",
    where: "Collections → Rules → In-stock product order.",
    screen: "Rules",
  },
  {
    name: "Automatic product hide/unpublish",
    what: "Can change product visibility when stock reaches the configured out-of-stock condition instead of only moving the item down.",
    when: "Use this when sold-out products should stop appearing on normal storefront discovery surfaces.",
    where: "Visibility → product visibility automation.",
    screen: "Visibility",
  },
  {
    name: "Automatic republish on restock",
    what: "Products previously changed by VSN can be restored when inventory returns, while merchant-owned changes remain protected.",
    when: "Use it with automatic hiding so restocked items can return without repetitive manual publishing work.",
    where: "Visibility → restore behavior.",
    screen: "Visibility",
  },
  {
    name: "SEO-safe soft hide",
    what: "Uses Shopify's soft-hide behavior so the product can remain directly reachable while being reduced on storefront discovery surfaces.",
    when: "Use this when removing a product entirely would be too aggressive for SEO, ads, or saved customer URLs.",
    where: "Visibility → hide mode.",
    screen: "Visibility",
  },
  {
    name: "Hide sold-out variants",
    what: "The theme app extension can hide unavailable variants on product pages while leaving available variants selectable.",
    when: "Use it for products with many variants where showing unavailable choices creates friction.",
    where: "Visibility → storefront variant controls; then enable the theme app extension in Shopify.",
    screen: "Visibility",
  },
  {
    name: "Restore variants on restock",
    what: "Previously hidden variants are shown again when Shopify reports them available on a later storefront render.",
    when: "Keep this paired with sold-out variant hiding so the storefront self-recovers after replenishment.",
    where: "Visibility → storefront variant controls.",
    screen: "Visibility",
  },
  {
    name: "Scheduled automation",
    what: "Runs eligible automation on a schedule using the hosted worker scheduler rather than requiring you to keep the admin page open.",
    when: "Use it for recurring merchandising jobs that should run even when nobody is logged into Shopify Admin.",
    where: "Automation → create or edit a schedule.",
    screen: "Automation",
  },
  {
    name: "Slack alerts",
    what: "Sends low-stock notifications to a configured Slack incoming webhook. The webhook secret is encrypted and is not displayed back after saving.",
    when: "Use this when inventory work is handled by a team that already operates in Slack.",
    where: "Alerts → Slack configuration.",
    screen: "Alerts",
  },
  {
    name: "Multi-location inventory rules",
    what: "Decides stock state using aggregate inventory, any selected location, or every selected location instead of treating the store as one pool.",
    when: "Use this when a product should count as available only in specific warehouses, regions, or operational locations.",
    where: "Collections → Rules → Inventory rule and Inventory locations.",
    screen: "Rules",
  },
  {
    name: "Advanced IF/AND/THEN rule builder",
    what: "Evaluates live Shopify stock conditions before invoking the certified sorting workflow, allowing more specific automation than a simple schedule.",
    when: "Use it when automation should run only when multiple inventory conditions are true.",
    where: "Automation → advanced rule builder.",
    screen: "Automation",
  },
  {
    name: "Inventory and automation analytics",
    what: "Shows metrics derived from persisted app activity instead of fabricated dashboard counters.",
    when: "Use it to understand how often automation is acting and where operational attention is concentrated.",
    where: "Analytics → overview metrics.",
    screen: "Analytics",
  },
  {
    name: "Activity and audit history",
    what: "Keeps shop-scoped records of sorting, visibility, settings, alerts, and related app actions within the plan's retention window.",
    when: "Use it to understand what happened, when it happened, and which automation path produced the change.",
    where: "Analytics → activity history.",
    screen: "Analytics",
  },
  {
    name: "CSV export",
    what: "Exports retained activity as an authenticated, shop-scoped CSV file.",
    when: "Use it for reporting, offline analysis, audits, or sharing activity evidence with another team.",
    where: "Analytics → Export CSV.",
    screen: "Analytics",
  },
  {
    name: "Shopify Markets rules",
    what: "Applies VSN-owned sold-out visibility automation to existing Shopify Market publication contexts and safely restores membership after restock.",
    when: "Use it when product availability should vary across Markets rather than globally.",
    where: "Commerce contexts → Markets.",
    screen: "Contexts",
  },
  {
    name: "B2B catalog rules",
    what: "Works with existing B2B/company-location publication contexts so catalog visibility can respond to stock without inventing new merchant catalogs.",
    when: "Use it when B2B buyers should have stock-aware catalog visibility separate from the normal online store.",
    where: "Commerce contexts → B2B catalogs.",
    screen: "Contexts",
  },
  {
    name: "Sales-channel visibility rules",
    what: "Automates VSN-owned product publication membership for existing sales-channel publication contexts.",
    when: "Use it when different Shopify sales channels need stock-aware product visibility.",
    where: "Commerce contexts → Sales channels.",
    screen: "Contexts",
  },
  {
    name: "API and webhook integrations",
    what: "Creates scoped merchant credentials for external API access and signed webhook delivery. Tokens are shown only at creation/rotation and stored as hashes.",
    when: "Use it when another system needs to read VSN activity or trigger supported workflows securely.",
    where: "Integrations → API credentials and webhook endpoints.",
    screen: "Integrations",
  },
  {
    name: "Priority support entitlement",
    what: "Support level is resolved from the active Shopify subscription on the server. Pro receives Priority support and Unlimited receives 24/7 Priority support.",
    when: "Use the Help center whenever you need assistance; the app automatically attaches the correct support entitlement.",
    where: "Help center → submit and review support requests.",
    screen: "Support",
  },
];

const SECTION_ORDER: Array<{
  id: string;
  label: string;
  screens: ScreenName[];
}> = [
  { id: "collections", label: "Collections & sorting", screens: ["Collections", "Rules"] },
  { id: "visibility", label: "Product & variant visibility", screens: ["Visibility"] },
  { id: "automation", label: "Automation", screens: ["Automation"] },
  { id: "alerts", label: "Alerts", screens: ["Alerts"] },
  { id: "analytics", label: "Analytics & history", screens: ["Analytics"] },
  { id: "contexts", label: "Commerce contexts", screens: ["Contexts"] },
  { id: "integrations", label: "Integrations", screens: ["Integrations"] },
  { id: "support", label: "Support", screens: ["Support"] },
];

function minimumPlan(feature: string) {
  return (
    BILLING_PLANS.find((plan) =>
      getImplementedPlanFeatureNames(plan.id).includes(feature),
    )?.name ?? "Not assigned"
  );
}

function screenRoute(screen: ScreenName) {
  switch (screen) {
    case "Collections":
    case "Rules":
      return "/app";
    case "Visibility":
      return "/app/visibility";
    case "Automation":
      return "/app/automation";
    case "Alerts":
      return "/app/alerts";
    case "Analytics":
      return "/app/analytics";
    case "Contexts":
      return "/app/contexts";
    case "Integrations":
      return "/app/integrations";
    case "Plans":
      return "/app/plans";
    case "Support":
      return "/app/support";
  }
}

const SCREENSHOT_FILE_BY_SCREEN: Record<ScreenName, string> = {
  Collections: "collections.jpg",
  Rules: "rules.jpg",
  Visibility: "visibility.jpg",
  Automation: "automation.jpg",
  Alerts: "alerts.jpg",
  Analytics: "analytics.jpg",
  Contexts: "contexts.jpg",
  Integrations: "integrations.jpg",
  Plans: "plans.jpg",
  Support: "support.jpg",
};

function UiSnapshot({
  screen,
  option,
}: {
  screen: ScreenName;
  option: string;
}) {
  const imagePath = "/docs/screenshots/" + SCREENSHOT_FILE_BY_SCREEN[screen];
  return (
    <figure className="vsn-doc-shot">
      <a href={imagePath} target="_blank" rel="noreferrer">
        <img
          src={imagePath}
          alt={screen + " screen showing " + option + " in the Staging app"}
          loading="lazy"
        />
      </a>
      <figcaption>
        Actual Staging app screen. The shop is on the Starter test plan, so
        higher-plan controls are shown locked where they are not included.
      </figcaption>
    </figure>
  );
}

const BEGINNER_HOW_TO: Record<
  string,
  { steps: string[]; result: string; care?: string }
> = {
  "Unlimited product and collection counts": {
    steps: ["Open Plans.", "Find your active plan.", "Confirm product and collection counts are listed as unlimited."],
    result: "You do not need to upgrade just because your catalog grows.",
  },
  "Sold-out push down": {
    steps: ["Open Collections.", "Choose one collection and click Enable.", "Click Sort now to run the saved stock rule.", "Check Shopify's collection order: available products should come before sold-out products."],
    result: "Sold-out products stay in the collection but move below available products.",
    care: "Start with one collection and review it before using Enable all.",
  },
  "Realtime inventory re-sort": {
    steps: ["Enable the collection you want VSN to manage.", "When Shopify inventory changes, let the inventory update reach the app.", "Check the collection again and review Analytics or activity history if your plan includes it."],
    result: "The same saved sorting rules are applied after supported inventory or product updates.",
  },
  "Restore original position": {
    steps: ["Open Collections.", "Find the collection VSN manages.", "Choose Disable & restore.", "Open the Shopify collection and check that its previous manual order returned."],
    result: "Automation stops and VSN asks Shopify to restore the saved order.",
    care: "Use this only for a collection VSN previously enabled; verify the result before changing more collections.",
  },
  "Manual and bulk sort controls": {
    steps: ["For one collection, click Sort now in its row.", "To manage the whole list, use Enable all collections or Disable all collections.", "Wait for the action result, then check the collection status and product order."],
    result: "Sort now runs one collection; bulk controls apply to the collection list.",
    care: "Bulk actions affect multiple collections. Beginners should test one collection first.",
  },
  "Tag/vendor/product exclusions": {
    steps: ["Open Collections, then Rules beside a collection.", "Enter excluded tags, vendors, or product handles/GIDs in the matching box.", "Use one value per line or separate values with commas.", "Save the rules, then sort the collection and confirm excluded items did not move."],
    result: "Matching products stay in their existing collection positions.",
    care: "A product handle is the short URL name, for example blue-shirt. A Shopify product GID is the product's Shopify ID.",
  },
  "Low-stock email alerts": {
    steps: ["Open Alerts.", "Choose a low-stock threshold that makes sense for your products.", "Confirm the alert email address and save.", "Test with a safe product or wait for inventory to cross the threshold, then check the alert."],
    result: "The configured email can be notified when tracked inventory reaches the threshold.",
    care: "A threshold of 5 means stock at or below 5 is low; choose a value that gives your team time to restock.",
  },
  "Pinned products": {
    steps: ["Open Collections and click Rules for a collection.", "Find Pinned products and select the products to protect.", "Arrange the pinned products in the priority order you want.", "Save, sort the collection, and check that pinned items appear ahead of normal sorting."],
    result: "Pinned products get priority over the regular available/sold-out order.",
    care: "Growth or higher is required. Check your plan before looking for this control.",
  },
  "Advanced collection sorting": {
    steps: ["Open Collections and click Rules.", "Choose an in-stock order such as title, inventory quantity, or product age.", "Choose the direction when the control offers one, then save.", "Click Sort now and review the available products and sold-out products."],
    result: "Available products follow the selected secondary order; sold-out items remain at the end.",
    care: "Growth or higher is required. Test on one collection because the order will change.",
  },
  "Automatic product hide/unpublish": {
    steps: ["Open Visibility.", "Choose the sold-out behavior only after confirming the desired storefront result.", "Turn on automatic restore if you want VSN to restore products after restock.", "Save, then inspect a test product in Shopify."],
    result: "VSN can change storefront visibility for sold-out products and restore changes it owns after restock.",
    care: "Growth or higher is required. Draft hides the product from storefront discovery; test with a non-critical product first.",
  },
  "Automatic republish on restock": {
    steps: ["Open Visibility.", "Choose a sold-out behavior that hides the product.", "Enable automatic restore when inventory returns.", "After a test restock, confirm only VSN-managed visibility changes were restored."],
    result: "Products VSN hid can return when they become available again.",
    care: "Growth or higher is required. Merchant-created Draft or Archived states must remain under merchant control.",
  },
  "SEO-safe soft hide": {
    steps: ["Open Visibility.", "Choose SEO-safe soft hide (Unlisted) as the sold-out behavior.", "Save and check the product in Shopify.", "Confirm it is removed from normal discovery surfaces while its direct URL remains usable."],
    result: "The product is unlisted rather than changed to Draft.",
    care: "Growth or higher is required. Confirm this behavior fits your storefront and search needs before enabling it.",
  },
  "Hide sold-out variants": {
    steps: ["Open Visibility and find Variant visibility.", "Enable the VSN theme app extension in Shopify's theme editor.", "Preview a product with both available and sold-out variants.", "Confirm sold-out choices are hidden and available choices still work."],
    result: "The storefront can hide unavailable variant choices.",
    care: "Growth or higher is required, and the theme app extension must be enabled for the storefront effect.",
  },
  "Restore variants on restock": {
    steps: ["Open Visibility and enable sold-out variant hiding.", "Enable automatic variant restore if shown.", "Restock a test variant.", "Reload the product page and confirm the available variant returns."],
    result: "A variant hidden by VSN can show again after Shopify reports stock.",
    care: "Growth or higher is required. Test the storefront after inventory has updated.",
  },
  "Scheduled automation": {
    steps: ["Open Automation.", "Choose Create schedule.", "Select the collections and schedule time/frequency.", "Save, then check the next-run information or activity record."],
    result: "Hosted Staging/Production can run due schedules without the admin page staying open.",
    care: "Growth or higher is required. Local development supports manual Run now only.",
  },
  "Slack alerts": {
    steps: ["Open Alerts and find Slack configuration.", "Create an incoming webhook in the correct Slack workspace/channel.", "Paste the webhook URL into VSN and save.", "Send a safe test alert if the screen offers one; otherwise verify using a controlled low-stock test."],
    result: "Low-stock notifications can be sent to the configured Slack destination.",
    care: "Growth or higher is required. Treat the webhook URL like a password; VSN does not show the saved secret again.",
  },
  "Multi-location inventory rules": {
    steps: ["Open Collections and click Rules.", "Choose the inventory mode: all locations, any selected location, or every selected location.", "Select the Shopify locations that should count.", "Save, sort a test collection, and compare the result with stock at those locations."],
    result: "VSN decides availability using the locations and rule you selected.",
    care: "Pro or higher is required. Check location stock in Shopify before relying on the rule.",
  },
  "Advanced IF/AND/THEN rule builder": {
    steps: ["Open Automation and choose the advanced rule builder.", "Add an IF condition using live inventory.", "Add AND only when all listed conditions must be true.", "Choose the THEN action, save, and review the rule before enabling it."],
    result: "Automation runs only when the conditions you configured are met.",
    care: "Pro or higher is required. Start with a simple test rule and check its result before adding more conditions.",
  },
  "Inventory and automation analytics": {
    steps: ["Open Analytics.", "Choose the date range or summary you need.", "Read the activity totals and charts shown.", "Use the activity history to inspect individual events when something needs explaining."],
    result: "The page summarizes persisted app activity for your shop.",
    care: "Pro or higher is required. A new or quiet store may have little activity to show.",
  },
  "Activity and audit history": {
    steps: ["Open Analytics and scroll to Activity history.", "Filter or review the events for the period you need.", "Open an event to see its type and time if details are available.", "Use the history to understand changes before adjusting rules."],
    result: "You can review recorded sorting, visibility, settings, alert, and related events.",
    care: "Pro or higher is required; the number of days retained depends on your plan.",
  },
  "CSV export": {
    steps: ["Open Analytics.", "Choose the date range for the records you need.", "Click Export CSV.", "Open the downloaded file in a spreadsheet and check the date range and columns."],
    result: "A CSV copy of retained activity is downloaded for reporting or review.",
    care: "Pro or higher is required. CSV includes only records still inside your plan's retention period.",
  },
  "Shopify Markets rules": {
    steps: ["Open Commerce contexts and choose Markets.", "Select an existing Market context.", "Set the stock visibility rule for that context and save.", "Review the affected publication after a controlled test."],
    result: "Stock-aware visibility can be managed for an existing Shopify Market context.",
    care: "Unlimited is required. This changes product publication for that context; verify the target carefully.",
  },
  "B2B catalog rules": {
    steps: ["Open Commerce contexts and choose B2B catalogs.", "Select an existing B2B/company-location catalog context.", "Configure the stock visibility rule and save.", "Check the catalog as a test buyer or in Shopify Admin."],
    result: "Stock-aware visibility can be applied to an existing B2B catalog context.",
    care: "Unlimited is required. VSN works with existing catalogs; it does not create a new catalog for you.",
  },
  "Sales-channel visibility rules": {
    steps: ["Open Commerce contexts and choose Sales channels.", "Select the existing channel context to manage.", "Choose the stock visibility behavior and save.", "Check publication status in Shopify after a controlled test."],
    result: "Product visibility can respond to stock for the selected sales channel.",
    care: "Unlimited is required. Confirm the channel before saving so you do not affect another storefront.",
  },
  "API and webhook integrations": {
    steps: ["Open Integrations.", "Create an API credential with only the permissions the other system needs.", "Copy and store the token securely when it is shown; it may not be shown again.", "For webhooks, enter the destination URL, save, then verify a test delivery and signature."],
    result: "External systems can use scoped API credentials or receive signed events.",
    care: "Unlimited is required. Never paste a token or webhook secret into public chat, documentation, or a screenshot.",
  },
  "Priority support entitlement": {
    steps: ["Open Help center.", "Describe the problem and include the affected screen or collection.", "Submit the request and keep its reference.", "Check the support page later for replies or status."],
    result: "The active plan determines the support level attached to the request.",
    care: "Pro includes Priority support; Unlimited includes 24/7 Priority support. Do not include passwords or API secrets.",
  },
};

function FeatureGuide({ guide }: { guide: Guide }) {
  const beginner = BEGINNER_HOW_TO[guide.name];
  return (
    <article className="vsn-doc-feature">
      <h3>{guide.name}</h3>
      <UiSnapshot screen={guide.screen} option={guide.name} />
      <p><strong>What it does:</strong> {guide.what}</p>
      <p><strong>When to use it:</strong> {guide.when}</p>
      <p><strong>Where to find it:</strong> {guide.where}</p>
      <span className="vsn-doc-plan">
        Available from {minimumPlan(guide.name)}
      </span>{" "}
      <Link to={screenRoute(guide.screen)}>Open {guide.screen} →</Link>
      {beginner ? (
        <details className="vsn-doc-howto">
          <summary>Show the beginner steps</summary>
          <ol>
            {beginner.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p><strong>What to expect:</strong> {beginner.result}</p>
          {beginner.care ? <p><strong>Before you use it:</strong> {beginner.care}</p> : null}
        </details>
      ) : null}
    </article>
  );
}

export default function DocumentationPage() {
  return (
    <PageShell>
      <PageIntro
        eyebrow="Beginner-friendly guide"
        title="Learn VSN Stock Down Sort from zero."
        description="A step-by-step guide to every implemented capability, written for merchants who have never used stock automation before."
      >
        <Link className="vsn-button primary" to="/app">
          Open Collections
        </Link>
      </PageIntro>

      <div className="vsn-notice success">
        <strong>New to the app?</strong> Start with the five setup steps below,
        then open “Show the beginner steps” on any feature card. Each card
        explains what the option does, where it is, what to click, and what
        result to expect. The screen previews are visual guides; use the live
        app screen as the final reference.
        <p><strong>Staging screenshots:</strong> these images show the real app screens from the Staging shop on the Starter test plan. Higher-plan controls are visibly locked where the Starter plan does not include them.</p>
      </div>

      <section className="vsn-doc-section" id="start-here">
        <h2>Start here: your first 5 minutes</h2>
        <p className="vsn-doc-lead">
          The safest beginner workflow is: choose one collection, enable it,
          check the result, tune its rules, then expand automation to more
          collections.
        </p>
        <div className="vsn-notice warning">
          <strong>Before you click Enable:</strong> this changes the selected
          Shopify collection’s product order. Start with one collection you
          control. To stop, use that collection’s Actions menu and choose
          “Disable &amp; restore” to return its saved previous order.
        </div>
        <div className="vsn-doc-steps">
          {[
            ["Open Collections", "Pick one Shopify collection you can safely test before enabling the whole catalog."],
            ["Click Enable beside that collection", "VSN immediately applies the saved/default sorting rule and marks the collection enabled."],
            ["Use Sort now to verify the result", "Confirm in Shopify that available products are ahead of sold-out products."],
            ["Open Rules", "Add exclusions or pins only if you need them. Save one change at a time while learning."],
            ["Add automation gradually", "After the first collection behaves correctly, enable more collections and configure alerts/schedules."],
          ].map(([title, body], index) => (
            <div className="vsn-doc-step" key={title}>
              <span className="vsn-doc-step-number">{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
        <UiSnapshot
          screen="Collections"
          option="Enable one collection before enabling everything"
        />
      </section>

      <div className="vsn-doc-shell">
        <nav className="vsn-doc-toc" aria-label="Documentation sections">
          <strong>Documentation</strong>
          <a href="#start-here">First 5 minutes</a>
          {SECTION_ORDER.map((section) => (
            <a key={section.id} href={"#" + section.id}>
              {section.label}
            </a>
          ))}
          <a href="#plans">Plans explained</a>
          <a href="#troubleshooting">Troubleshooting</a>
        </nav>

        <div className="vsn-doc-content">
          {SECTION_ORDER.map((section) => {
            const guides = GUIDES.filter((guide) =>
              section.screens.includes(guide.screen),
            );

            return (
              <section
                className="vsn-doc-section"
                id={section.id}
                key={section.id}
              >
                <h2>{section.label}</h2>
                <p className="vsn-doc-lead">
                  Each card explains the control in plain language, when it is
                  useful, and exactly where to find it.
                </p>
                <div className="vsn-doc-feature-grid">
                  {guides.map((guide) => (
                    <FeatureGuide key={guide.name} guide={guide} />
                  ))}
                </div>
              </section>
            );
          })}

          <section className="vsn-doc-section" id="plans">
            <h2>Plans explained</h2>
            <p className="vsn-doc-lead">
              Every plan has unlimited product and collection counts. Higher
              tiers unlock additional capabilities rather than larger catalog
              limits.
            </p>
            <UiSnapshot
              screen="Plans"
              option="Compare every implemented capability by tier"
            />
            <div className="vsn-doc-feature-grid">
              {BILLING_PLANS.map((plan, index) => {
                const previousPlan = index > 0 ? BILLING_PLANS[index - 1] : null;
                const previousFeatures = new Set(
                  previousPlan
                    ? getImplementedPlanFeatureNames(previousPlan.id)
                    : [],
                );
                const additions = getImplementedPlanFeatureNames(plan.id).filter(
                  (feature) => !previousFeatures.has(feature),
                );

                return (
                  <article className="vsn-doc-feature" key={plan.id}>
                    <h3>
                      {plan.name} — {"$" + plan.amount.toFixed(2) + " / 30 days"}
                    </h3>
                    <p>
                      <strong>Trial:</strong> {plan.trial_days} days.
                    </p>
                    <p>
                      <strong>History:</strong>{" "}
                      {plan.history_retention_days == null
                        ? "Unlimited"
                        : plan.history_retention_days + " days"}.
                    </p>
                    <p>
                      <strong>Tier additions:</strong>{" "}
                      {additions.join(", ")}.
                    </p>
                  </article>
                );
              })}
            </div>
            <Link className="vsn-button primary" to="/app/plans">
              Open full plan comparison
            </Link>
          </section>

          <section className="vsn-doc-section" id="troubleshooting">
            <h2>Beginner troubleshooting</h2>
            <div className="vsn-doc-steps">
              {[
                ["A collection did not move", "Make sure the collection is enabled, then use Sort now. Check the row for an Attention error and review exclusions/pins that may intentionally keep products fixed."],
                ["A feature is disabled", "Open Plans and confirm your active tier includes the capability. VSN enforces entitlements on the server, so changing browser UI cannot unlock a higher-tier feature."],
                ["Variants are still visible", "The storefront variant feature also needs the VSN theme app extension enabled in the Shopify theme editor."],
                ["An alert did not arrive", "Check Alerts settings, the threshold, current inventory, and the configured hosted delivery channel. Local development does not claim external email delivery."],
                ["Billing does not open", "Use the visible Continue to Shopify plan approval fallback link. If approval still fails, capture the fresh app terminal logs after the click."],
                ["Need help from VSN", "Open Help center, submit a support request, and the server will attach the support priority from your active plan."],
              ].map(([title, body], index) => (
                <div className="vsn-doc-step" key={title}>
                  <span className="vsn-doc-step-number">{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link className="vsn-button" to="/app/support">
              Open Help center
            </Link>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
