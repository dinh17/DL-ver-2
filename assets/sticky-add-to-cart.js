import { Component } from '@theme/component';
import { ThemeEvents, QuantitySelectorUpdateEvent } from '@theme/events';
import { morph } from '@theme/morph';
import { onAnimationEnd } from '@theme/utilities';

/**
 * @typedef {Object} ProductVariant
 * @property {string|number} [id] - Variant ID
 * @property {string} [title] - Variant title
 * @property {string} [name] - Variant name
 * @property {boolean} [available] - Whether variant is available
 * @property {Object} [featured_media] - Featured media object
 * @property {Object} [featured_media.preview_image] - Preview image data
 * @property {string} [featured_media.preview_image.src] - Image source URL
 * @property {string} [featured_media.alt] - Alt text for the image
 */

/**
 * @typedef {HTMLElement & {
 *   source: Element,
 *   destination: Element,
 *   useSourceSize: string | boolean
 * }} FlyToCart
 */

/**
 * @typedef {Object} StickyAddToCartRefs
 * @property {HTMLElement} stickyBar - The floating bar container
 * @property {HTMLButtonElement} previewButton - Sticky bar's preview button
 * @property {HTMLElement} quantityDisplay - Quantity display container
 * @property {HTMLElement} quantityNumber - Quantity number element
 * @property {HTMLImageElement} productImage - Product image element
 */

/**
 * A custom element that manages a sticky add-to-cart bar.
 * Shows when the main buy buttons scroll out of view.
 *
 * @extends {Component<StickyAddToCartRefs>}
 */
class StickyAddToCartComponent extends Component {
  requiredRefs = ['stickyBar', 'addToCartButton', 'quantityDisplay', 'quantityNumber'];

  /** @type {IntersectionObserver | null} */
  #buyButtonsIntersectionObserver = null;

  /** @type {IntersectionObserver | null} */
  #mainBottomObserver = null;

  /** @type {number | undefined} */
  #resetTimeout;

  /** @type {boolean} */
  #isStuck = false;

  /** @type {number | null} */
  #animationTimeout = null;

  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {number} */
  #currentQuantity = 1;

  /** @type {boolean} */
  #hiddenByBottom = false;

  /** Sticky pressed: wait for successful cart add before fly animation */
  /** @type {{ productId: string, variantId: string } | null} */
  #stickyFlyExpectation = null;

  /** @type {ReturnType<typeof setTimeout> | null} */
  #stickyFlyTimeoutId = null;

  /** @type {HTMLButtonElement | null} */
  #sourceAddToCartButton = null;

  /** @type {MutationObserver | null} */
  #sourceAddToCartObserver = null;

  connectedCallback() {
    super.connectedCallback();

    this.#setupIntersectionObserver();

    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section');
    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#handleVariantSelected, { signal });

    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#handleQuantityUpdate, { signal });
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdateForStickyFly, { signal });

    this.#getInitialQuantity();
    window.CherifyStickyBar?.initSticky?.(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#buyButtonsIntersectionObserver?.disconnect();
    this.#mainBottomObserver?.disconnect();
    this.#abortController.abort();
    if (this.#animationTimeout) {
      clearTimeout(this.#animationTimeout);
    }
    this.#clearStickyFlyPending();
    this.#teardownSourceAddToCartSync();
  }

  static #STICKY_FLY_PENDING_MS = 15000;
  static #LOADING_SOURCE_CLASSES = ['ld-over-inverse', 'running', 'disable-pointer-events'];

  #clearStickyFlyPending() {
    if (this.#stickyFlyTimeoutId != null) {
      clearTimeout(this.#stickyFlyTimeoutId);
      this.#stickyFlyTimeoutId = null;
    }
    this.#stickyFlyExpectation = null;
  }

  /**
   * @param {HTMLElement | null} productForm
   */
  #armStickyFlyPending(productForm) {
    this.#clearStickyFlyPending();
    const variantInput = /** @type {HTMLInputElement | null} */ (productForm?.querySelector('input[name="id"]'));
    const variantId = variantInput?.value || this.dataset.currentVariantId || '';
    const productId = this.dataset.productId || '';
    if (!variantId || !productId) return;
    this.#stickyFlyExpectation = { productId: String(productId), variantId: String(variantId) };
    this.#stickyFlyTimeoutId = setTimeout(() => this.#clearStickyFlyPending(), StickyAddToCartComponent.#STICKY_FLY_PENDING_MS);
  }

  /**
   * Fly + checkmark only after real add-to-cart success (Customily may block submit).
   * @param {Event} event
   */
  #handleCartUpdateForStickyFly = (event) => {
    if (!this.#stickyFlyExpectation) return;
    const d = event.detail?.data;
    if (!d || d.source !== 'product-form-component') return;
    if (d.didError) {
      this.#clearStickyFlyPending();
      return;
    }
    const exp = this.#stickyFlyExpectation;
    if (String(d.productId ?? '') !== exp.productId) return;
    if (String(event.detail?.sourceId ?? '') !== exp.variantId) return;
    this.#clearStickyFlyPending();
    void this.#runStickyFlyToCartAnimation();
  };

  /**
   * @param {Element} element
   * @returns {boolean}
   */
  #isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const styles = getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0';
  }

  /**
   * Mirrors the source product-info ATC loading classes/attrs into sticky ATC.
   * @param {HTMLButtonElement | null} sourceButton
   */
  #syncStickyLoadingState(sourceButton) {
    const stickyButton = this.refs.addToCartButton;
    if (!stickyButton) return;

    const sourceClasses = sourceButton?.classList;
    for (const className of StickyAddToCartComponent.#LOADING_SOURCE_CLASSES) {
      stickyButton.classList.toggle(className, Boolean(sourceClasses?.contains(className)));
    }

    const sourceBusy =
      sourceButton?.classList.contains('running') ||
      sourceButton?.getAttribute('aria-busy') === 'true' ||
      sourceButton?.getAttribute('data-loading') === 'true';
    if (sourceBusy) {
      stickyButton.setAttribute('aria-busy', 'true');
      stickyButton.dataset.loading = 'true';
    } else {
      stickyButton.removeAttribute('aria-busy');
      delete stickyButton.dataset.loading;
    }
  }

  /**
   * Rebind loading-state sync to the currently active product-info add-to-cart button.
   * @param {HTMLElement | null} productForm
   * @returns {HTMLButtonElement | null}
   */
  #bindSourceAddToCartSync(productForm) {
    const sourceButton = this.#resolveProductInfoAddToCartButton(productForm);
    if (!sourceButton) {
      this.#teardownSourceAddToCartSync();
      return null;
    }
    if (this.#sourceAddToCartButton === sourceButton) {
      this.#syncStickyLoadingState(sourceButton);
      return sourceButton;
    }

    this.#sourceAddToCartObserver?.disconnect();
    this.#sourceAddToCartButton = sourceButton;
    this.#sourceAddToCartObserver = new MutationObserver(() => this.#syncStickyLoadingState(sourceButton));
    this.#sourceAddToCartObserver.observe(sourceButton, {
      attributes: true,
      attributeFilter: ['class', 'disabled', 'aria-busy', 'aria-disabled', 'data-loading'],
    });
    this.#syncStickyLoadingState(sourceButton);

    return sourceButton;
  }

  #teardownSourceAddToCartSync() {
    this.#sourceAddToCartObserver?.disconnect();
    this.#sourceAddToCartObserver = null;
    this.#sourceAddToCartButton = null;
    this.#syncStickyLoadingState(null);
  }

  /**
   * Main PDP add-to-cart in product info (buy-buttons row). Customily hooks validation here, not on the sticky bar.
   * Scoped to `.buy-buttons-block` so we never proxy to another `product-form` (e.g. quick-add).
   * @param {HTMLElement | null} productForm
   * @returns {HTMLButtonElement | null}
   */
  #resolveProductInfoAddToCartButton(productForm) {
    if (!productForm) return null;
    const buyBlock = productForm.closest('.buy-buttons-block');
    const candidates = Array.from(
      buyBlock?.querySelectorAll('button[name="add"], [ref="addToCartButton"]') ?? []
    ).filter((button) => button instanceof HTMLButtonElement && !button.closest('sticky-add-to-cart'));
    const visibleCandidate = candidates.find((button) => this.#isElementVisible(button));
    if (visibleCandidate instanceof HTMLButtonElement) return visibleCandidate;
    const anyCandidate = candidates[0];
    if (anyCandidate instanceof HTMLButtonElement) return anyCandidate;

    const inBuyBlock = buyBlock?.querySelector('button[name="add"], [ref="addToCartButton"]');
    if (inBuyBlock instanceof HTMLButtonElement && !inBuyBlock.closest('sticky-add-to-cart')) return inBuyBlock;
    const inFormRow = productForm.querySelector('.product-form-buttons [ref="addToCartButton"]');
    if (inFormRow instanceof HTMLButtonElement) return inFormRow;
    const fallback = productForm.querySelector('[ref="addToCartButton"]');
    return fallback instanceof HTMLButtonElement ? fallback : null;
  }

  /**
   * Sets up the IntersectionObserver to watch the buy buttons visibility
   */
  #setupIntersectionObserver() {
    const productForm = this.#getProductForm();
    if (!productForm) return;

    const buyButtonsBlock = productForm.closest('.buy-buttons-block');
    if (!buyButtonsBlock) return;

    // In themes migrated from 2.0, the footer element doesn't exist
    const footer = document.querySelector('footer') ?? document.querySelector('[class*="footer-group"]');
    if (!footer) return;

    // Observer for buy buttons visibility
    this.#buyButtonsIntersectionObserver = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry) return;

      // Only show sticky bar if buy buttons have been scrolled past (above viewport)
      if (!entry.isIntersecting && !this.#isStuck) {
        // Check if the element is above the viewport (scrolled past) or below (not yet reached)
        const rect = entry.target.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top < 0) {
          // Element is above viewport - show sticky bar
          this.#showStickyBar();
        }
        // If rect.top >= 0, element is below viewport - don't show sticky bar yet
      } else if (entry.isIntersecting && this.#isStuck) {
        this.#hiddenByBottom = false;
        this.#hideStickyBar();
      }
    });

    // Observer for footer visibility - hides sticky bar at page bottom
    this.#mainBottomObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) return;

        if (entry.isIntersecting && this.#isStuck) {
          this.#hiddenByBottom = true;
          this.#hideStickyBar();
        } else if (!entry.isIntersecting && this.#hiddenByBottom) {
          // Footer out of view - check if we should show sticky bar again
          const rect = buyButtonsBlock.getBoundingClientRect();
          // Only show if buy buttons are above the viewport (scrolled past)
          if (rect.bottom < 0 || rect.top < 0) {
            this.#hiddenByBottom = false;
            this.#showStickyBar();
          }
        }
      },
      {
        rootMargin: '200px 0px 0px 0px',
      }
    );

    this.#buyButtonsIntersectionObserver.observe(buyButtonsBlock);
    this.#mainBottomObserver.observe(footer);
    this.#bindSourceAddToCartSync(productForm);

    buyButtonsBlock.addEventListener('click', this.#onBuyButtonsTrustedClick, {
      signal: this.#abortController.signal,
      capture: true,
    });
  }

  /** User clicked main product-info ATC (trusted) — cancel sticky fly wait so main add does not trigger sticky animation */
  #onBuyButtonsTrustedClick = (event) => {
    if (!event.isTrusted || !this.#stickyFlyExpectation) return;
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (!t.closest('button[name="add"], [ref="addToCartButton"]')) return;
    this.#clearStickyFlyPending();
  };

  // Public action handlers
  /**
   * Handles the add to cart button click in the sticky bar
   */
  handleAddToCartClick = async () => {
    const productForm = this.#getProductForm();
    const targetBtn = this.#bindSourceAddToCartSync(productForm);
    if (!targetBtn) return;
    this.#armStickyFlyPending(productForm);
    targetBtn.click();
  };

  /**
   * Primary CTA: Preview Customily when available, otherwise proxy to main ATC.
   */
  handlePrimaryActionClick = () => {
    const mode =
      this.dataset.primaryActionResolved ||
      window.CherifyStickyBar?.resolvePrimaryMode?.(this) ||
      'atc';
    if (mode === 'preview') {
      this.handlePreviewClick();
      return;
    }
    void this.handleAddToCartClick();
  };

  /**
   * Handles the preview button click in the sticky bar
   */
  handlePreviewClick = () => {
    const section = this.closest('[data-testid="product-information"]') || document.querySelector('[data-testid="product-information"]');
    const previewButton = section?.querySelector('#customily-preview-button') || section?.querySelector('button.customily-preview-button') || document.getElementById('customily-preview-button');
    if (previewButton instanceof HTMLButtonElement) {
      previewButton.click();
    }
  };

  async #runStickyFlyToCartAnimation() {
    const cartIcon = document.querySelector('.header-actions__cart-icon');

    if (this.refs.addToCartButton.dataset.added !== 'true') {
      this.refs.addToCartButton.dataset.added = 'true';
    }

    if (!cartIcon || !this.refs.addToCartButton || !this.refs.productImage) return;
    if (this.#resetTimeout) clearTimeout(this.#resetTimeout);

    const flyToCartElement = /** @type {FlyToCart} */ (document.createElement('fly-to-cart'));

    flyToCartElement.classList.add('fly-to-cart--sticky');
    flyToCartElement.style.setProperty('background-image', `url(${this.refs.productImage.src})`);
    flyToCartElement.useSourceSize = 'true';
    flyToCartElement.source = this.refs.productImage;
    flyToCartElement.destination = cartIcon;

    document.body.appendChild(flyToCartElement);

    await onAnimationEnd([this.refs.addToCartButton, flyToCartElement]);
    this.#resetTimeout = setTimeout(() => {
      this.refs.addToCartButton.removeAttribute('data-added');
    }, 800);
  }

  /**
   * Handles variant update events
   * @param {CustomEvent} event - The variant update event
   */
  #handleVariantUpdate = (event) => {
    if (event.detail.data.productId !== this.dataset.productId) return;

    const variant = event.detail.resource;

    // Get the new sticky add to cart HTML from the server response
    const newStickyAddToCart = event.detail.data.html.querySelector('sticky-add-to-cart');
    if (!newStickyAddToCart) return;

    const newStickyBar = newStickyAddToCart.querySelector('[ref="stickyBar"]');
    if (!newStickyBar) return;

    // Store current visibility state before morphing
    const currentStuck = this.refs.stickyBar.getAttribute('data-stuck') || 'false';
    const variantAvailable = newStickyAddToCart.dataset.variantAvailable;

    // Morph the entire sticky bar content
    morph(this.refs.stickyBar, newStickyBar, { childrenOnly: true });

    // Restore visibility state after morphing
    this.refs.stickyBar.setAttribute('data-stuck', currentStuck);
    this.dataset.variantAvailable = variantAvailable;

    // Update the dataset attributes with new variant info
    if (variant && variant.id) {
      this.dataset.currentVariantId = variant.id;
    }

    if (variant == null) {
      this.#handleVariantUnavailable();
    }
    this.#bindSourceAddToCartSync(this.#getProductForm());
    // Restore the current quantity display if needed
    this.#updateButtonText();
    window.CherifyStickyBar?.initSticky?.(this);
  };

  /**
   * Handles variant selected events
   * @param {CustomEvent} event - The variant selected event
   */
  #handleVariantSelected = (event) => {
    // The variant update event will follow and handle all updates via morph
    // We just update the dataset here for tracking
    const variantId = event.detail.resource?.id;
    if (!variantId) return;
    this.dataset.currentVariantId = variantId;
  };

  /**
   * Updates the variant title based on selected options when the variant is unavailable
   */
  #handleVariantUnavailable = () => {
    this.dataset.currentVariantId = '';
    const variantTitleElement = this.querySelector('.sticky-add-to-cart__variant');
    const productId = this.dataset.productId;
    const variantPicker = document.querySelector(`variant-picker[data-product-id="${productId}"]`);
    if (!variantTitleElement || !variantPicker) return;

    const selectedOptions = Array.from(variantPicker.querySelectorAll('input:checked'))
      .map((option) => /** @type {HTMLInputElement} */ (option).value)
      .filter((value) => value !== '')
      .join(' / ');
    if (!selectedOptions) return;
    variantTitleElement.textContent = selectedOptions;
  };

  /**
   * Handles quantity selector update events
   * @param {QuantitySelectorUpdateEvent} event - The quantity update event
   */
  #handleQuantityUpdate = (event) => {
    // Only respond to product page quantity selector updates, not cart drawer
    if (event.detail.cartLine) return;

    this.#currentQuantity = event.detail.quantity;
    this.#updateButtonText();
  };

  /**
   * Shows the sticky bar with animation
   */
  #showStickyBar() {
    const { stickyBar } = this.refs;
    this.#isStuck = true;
    stickyBar.dataset.stuck = 'true';
  }

  /**
   * Hides the sticky bar with animation
   */
  #hideStickyBar() {
    const { stickyBar } = this.refs;
    this.#isStuck = false;
    stickyBar.dataset.stuck = 'false';
  }

  // Helper methods
  /**
   * Gets the product form element
   * @returns {HTMLElement | null}
   */
  #getProductForm() {
    const productId = this.dataset.productId;
    if (!productId) return null;

    const sectionElement = this.closest('.shopify-section');
    if (!sectionElement) return null;

    const sectionId = sectionElement.id.replace('shopify-section-', '');
    return document.querySelector(
      `#shopify-section-${sectionId} product-form-component[data-product-id="${productId}"]`
    );
  }

  /**
   * Gets the initial quantity from the data attribute
   */
  #getInitialQuantity() {
    this.#currentQuantity = parseInt(this.dataset.initialQuantity || '1') || 1;
    this.#updateButtonText();
  }

  /**
   * Updates the button text to include quantity
   */
  #updateButtonText() {
    const { addToCartButton, quantityDisplay, quantityNumber } = this.refs;

    const available = !addToCartButton.disabled;

    // Update the quantity number
    if (quantityNumber) quantityNumber.textContent = this.#currentQuantity.toString();

    // Show/hide the quantity display based on availability and quantity
    if (quantityDisplay) {
      if (available && this.#currentQuantity > 1) {
        quantityDisplay.style.display = 'inline';
      } else {
        quantityDisplay.style.display = 'none';
      }
    }
  }
}

if (!customElements.get('sticky-add-to-cart')) {
  customElements.define('sticky-add-to-cart', StickyAddToCartComponent);
}
