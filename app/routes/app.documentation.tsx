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

function UiSnapshot({
  screen,
  option,
}: {
  screen: ScreenName;
  option: string;
}) {
  const action =
    screen === "Collections"
      ? "Enable"
      : screen === "Rules"
        ? "Save rules"
        : screen === "Automation"
          ? "Save automation"
          : screen === "Alerts"
            ? "Save settings"
            : screen === "Analytics"
              ? "Export CSV"
              : screen === "Integrations"
                ? "Create credential"
                : screen === "Support"
                  ? "Submit request"
                  : "Configure";

  return (
    <div className="vsn-doc-shot" aria-label={screen + " UI visual"}>
      <svg
        viewBox="0 0 720 210"
        role="img"
        aria-label={screen + " screen showing " + option}
      >
        <rect width="720" height="210" fill="#f4f6fa" />
        <rect width="720" height="38" fill="#ffffff" />
        <rect x="14" y="9" width="22" height="22" rx="6" fill="#3e4144" />
        <text x="21" y="25" fill="#ffffff" fontSize="12" fontWeight="700">V</text>
        <text x="46" y="24" fill="#3e4144" fontSize="12" fontWeight="700">
          VSN | Stock Down Sort
        </text>
        <rect x="0" y="38" width="118" height="172" fill="#ffffff" />
        <rect x="9" y="54" width="100" height="26" rx="6" fill="#f1f0fa" />
        <text x="20" y="71" fill="#625ba8" fontSize="10" fontWeight="700">
          {screen}
        </text>
        <text x="138" y="67" fill="#625ba8" fontSize="8" fontWeight="700">
          {screen.toUpperCase()}
        </text>
        <text x="138" y="91" fill="#3e4144" fontSize="16" fontWeight="700">
          {option.length > 48 ? option.slice(0, 45) + "…" : option}
        </text>
        <rect x="138" y="108" width="548" height="70" rx="10" fill="#ffffff" stroke="#dde1ea" />
        <rect x="154" y="123" width="190" height="10" rx="5" fill="#e2e4eb" />
        <rect x="154" y="143" width="310" height="8" rx="4" fill="#f0f1f5" />
        <rect x="154" y="159" width="245" height="8" rx="4" fill="#f0f1f5" />
        <rect x="548" y="128" width="116" height="32" rx="7" fill="#5cc9d7" />
        <text x="576" y="148" fill="#3e4144" fontSize="10" fontWeight="700">
          {action}
        </text>
        <text x="138" y="197" fill="#72767b" fontSize="9">
          UI visual guide • open {screen} in the app for the live control
        </text>
      </svg>
    </div>
  );
}

function FeatureGuide({ guide }: { guide: Guide }) {
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
        then use the feature guide when you want to understand a specific
        option. Every feature card includes a UI visual and a direct link to the
        live screen.
      </div>

      <section className="vsn-doc-section" id="start-here">
        <h2>Start here: your first 5 minutes</h2>
        <p className="vsn-doc-lead">
          The safest beginner workflow is: choose one collection, enable it,
          check the result, tune its rules, then expand automation to more
          collections.
        </p>
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
