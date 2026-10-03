(() => {
  const DATA_SELECTOR = "script[data-vsn-variant-visibility]";
  const MANAGED_ATTR = "data-vsn-variant-managed";
  const DISABLED_BY_US_ATTR = "data-vsn-disabled-by-us";

  function readVariants() {
    const node = document.querySelector(DATA_SELECTOR);
    if (!node) return null;

    try {
      const parsed = JSON.parse(node.textContent || "{}");
      return Array.isArray(parsed.variants)
        ? parsed.variants.map((variant) => ({
            id: String(variant.id || ""),
            available: Boolean(variant.available),
          }))
        : [];
    } catch {
      return null;
    }
  }

  function selectorForVariant(variantId) {
    const gid = `gid://shopify/ProductVariant/${variantId}`;
    return [
      `[data-variant-id="${CSS.escape(variantId)}"]`,
      `[data-variant-id="${CSS.escape(gid)}"]`,
      `option[value="${CSS.escape(variantId)}"]`,
      `input[name="id"][value="${CSS.escape(variantId)}"]`,
      `button[value="${CSS.escape(variantId)}"]`,
    ].join(",");
  }

  function managedContainer(element) {
    if (element.matches("option")) return element;

    if (element.id) {
      const label = document.querySelector(
        `label[for="${CSS.escape(element.id)}"]`,
      );
      if (label) return label;
    }

    return (
      element.closest(
        "[data-variant-option], .product-form__input label, .swatch, .variant-option",
      ) || element
    );
  }

  function restoreManaged() {
    document
      .querySelectorAll(`[${MANAGED_ATTR}="true"]`)
      .forEach((element) => {
        element.hidden = false;
        element.removeAttribute(MANAGED_ATTR);
        element.removeAttribute("aria-hidden");
        element.removeAttribute("aria-disabled");

        if ("disabled" in element) {
          element.disabled = false;
        }
      });
  }

  function concealVariant(variantId) {
    document.querySelectorAll(selectorForVariant(variantId)).forEach((control) => {
      const container = managedContainer(control);

      // Never claim ownership of visibility already controlled by the theme.
      if (container.hidden || container.getAttribute("aria-hidden") === "true") {
        return;
      }

      container.hidden = true;
      container.setAttribute(MANAGED_ATTR, "true");
      container.setAttribute("aria-hidden", "true");

      if ("disabled" in control && !control.disabled) {
        control.disabled = true;
        control.setAttribute(DISABLED_BY_US_ATTR, "true");
      }
      control.setAttribute("aria-disabled", "true");
    });
  }

  function applyVisibility() {
    const variants = readVariants();
    if (!variants) return;

    restoreManaged();

    variants.forEach((variant) => {
      if (!variant.available && variant.id) {
        concealVariant(variant.id);
      }
    });
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyVisibility();
    });
  }

  function start() {
    if (!document.querySelector(DATA_SELECTOR)) return;

    applyVisibility();

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === "childList" &&
            (mutation.addedNodes.length || mutation.removedNodes.length),
        )
      ) {
        scheduleApply();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("change", scheduleApply, true);
    document.addEventListener("shopify:section:load", scheduleApply);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
