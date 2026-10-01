import { DialogComponent, DialogCloseEvent, DialogOpenEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

/**
 * @typedef {object} CartLineOption
 * @property {string} name
 * @property {string} value
 */

/**
 * @typedef {object} CartLineItem
 * @property {number} variant_id
 * @property {string} [key]
 * @property {string} [product_title]
 * @property {string} [title]
 * @property {string} [variant_title]
 * @property {string} [image]
 * @property {{ url?: string } | null} [featured_image]
 * @property {Record<string, string>} [properties]
 * @property {CartLineOption[]} [options_with_values]
 * @property {string} [option1]
 * @property {string} [option2]
 * @property {string} [option3]
 * @property {number} [quantity]
 * @property {number} [price]
 * @property {number} [final_price]
 * @property {number} [line_price]
 * @property {number} [original_line_price]
 */

/**
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog
 * @property {HTMLElement} productPreview
 * @property {HTMLElement} productImageWrap
 * @property {HTMLImageElement} productImage
 * @property {HTMLElement} productTitle
 * @property {HTMLElement} productOptions
 * @property {HTMLElement} productQuantity
 * @property {HTMLElement} productPrice
 */

const CART_ADD_URL_PATTERN = /\/cart\/add(\.js)?(\?|$)/;
const SHOW_DEBOUNCE_MS = 800;
const THEME_ADD_COALESCE_MS = 250;
const INTERCEPT_DEFER_MS = 120;

/** @type {Set<string>} */
const CART_ADD_SOURCES = new Set(['product-form-component', 'quick-order-quantity']);

/** @type {{ payload: unknown; source: string } | null} */
let pendingCartAdd = null;

/** @type {number} */
let lastThemeCartAddAt = 0;

/** @extends {DialogComponent<Refs>} */
class ATCConfirmationDialog extends DialogComponent {
  requiredRefs = [
    'dialog',
    'productPreview',
    'productImageWrap',
    'productImage',
    'productTitle',
    'productOptions',
    'productQuantity',
    'productPrice',
  ];

  /** @type {number | undefined} */
  #autoCloseTimeout;

  /** @type {number} */
  #lastShownAt = 0;

  /** @type {string} */
  #capturedPreviewUrl = '';

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#handleDialogOpen);
    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);

    if (pendingCartAdd) {
      const queued = pendingCartAdd;
      pendingCartAdd = null;
      this.#handleCartAddPayload(queued.payload, queued.source);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#handleDialogOpen);
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
    this.#clearAutoClose();
    document.documentElement.removeAttribute('data-atc-confirmation-open');
  }

  /**
   * @param {RequestInfo | URL} input
   * @returns {URL | null}
   */
  static #parseRequestUrl(input) {
    try {
      if (typeof input === 'string') return new URL(input, window.location.href);
      if (input instanceof URL) return input;
      if (input instanceof Request) return new URL(input.url, window.location.href);
    } catch {
      return null;
    }

    return null;
  }

  /**
   * @param {RequestInfo | URL} input
   */
  static #isCartAddRequest(input) {
    const url = ATCConfirmationDialog.#parseRequestUrl(input);
    if (!url) return false;
    return CART_ADD_URL_PATTERN.test(url.pathname);
  }

  static installNetworkInterceptors() {
    if (window.__crfAtcDialogNetworkPatched) return;
    window.__crfAtcDialogNetworkPatched = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const requestInput = args[0];
      if (ATCConfirmationDialog.#isCartAddRequest(requestInput)) {
        ATCConfirmationDialog.#capturePreviewForAllInstances();
      }

      const response = await originalFetch(...args);

      try {
        const requestInput = args[0];
        if (ATCConfirmationDialog.#isCartAddRequest(requestInput) && response.ok) {
          const payload = await response.clone().json();
          ATCConfirmationDialog.#notifyCartAdd(payload, 'fetch');
        }
      } catch {
        // Ignore non-JSON or malformed cart add responses.
      }

      return response;
    };

    const xhrProto = XMLHttpRequest.prototype;
    const originalOpen = xhrProto.open;
    const originalSend = xhrProto.send;

    xhrProto.open = function (method, url, ...rest) {
      this.__crfAtcUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    xhrProto.send = function (...sendArgs) {
      const url = this.__crfAtcUrl;
      const isCartAdd = typeof url === 'string' && CART_ADD_URL_PATTERN.test(url);

      if (isCartAdd) {
        ATCConfirmationDialog.#capturePreviewForAllInstances();

        this.addEventListener('load', () => {
          try {
            if (this.status < 200 || this.status >= 300) return;

            const payload = JSON.parse(this.responseText);
            ATCConfirmationDialog.#notifyCartAdd(payload, 'xhr');
          } catch {
            // Ignore non-JSON or malformed cart add responses.
          }
        });
      }

      return originalSend.apply(this, sendArgs);
    };
  }

  static #capturePreviewForAllInstances() {
    for (const element of document.querySelectorAll('atc-confirmation-dialog')) {
      if (element instanceof ATCConfirmationDialog) {
        element.#captureCustomilyPreviewSnapshot();
      }
    }
  }

  /**
   * @param {unknown} payload
   * @param {string} source
   */
  static #notifyCartAdd(payload, source) {
    const dialog = document.querySelector('atc-confirmation-dialog');
    if (!(dialog instanceof ATCConfirmationDialog)) {
      pendingCartAdd = { payload, source };
      return;
    }

    dialog.#handleCartAddPayload(payload, source);
  }

  /**
   * @param {Event} event
   */
  #handleCartAdd = (event) => {
    if (!(event instanceof CartAddEvent)) return;

    const { detail } = event;
    const data = detail?.data;

    if (data?.didError) return;
    if (!data?.source || !CART_ADD_SOURCES.has(data.source)) return;

    lastThemeCartAddAt = Date.now();

    let item = this.#resolveAddedItem(detail?.resource, detail?.sourceId);
    if (!item) {
      item = this.#getProductFromDom(event.target);
    }

    if (!item) return;

    this.#showConfirmationForItem(item);
  };

  /**
   * @param {unknown} payload
   * @param {string} source
   */
  async #handleCartAddPayload(payload, source) {
    if (!payload || typeof payload !== 'object') return;

    /** @type {Record<string, unknown>} */
    const data = /** @type {Record<string, unknown>} */ (payload);

    if (data.status) return;

    if (source === 'fetch' || source === 'xhr') {
      await new Promise((resolve) => setTimeout(resolve, INTERCEPT_DEFER_MS));
      if (Date.now() - lastThemeCartAddAt < THEME_ADD_COALESCE_MS) return;
    }

    let item = this.#normalizeCartAddPayload(data);
    if (!item) return;

    item = await this.#enrichItemWithCartPreview(item);
    this.#showConfirmationForItem(item);
  }

  /**
   * @param {CartLineItem} item
   * @returns {Promise<CartLineItem>}
   */
  async #enrichItemWithCartPreview(item) {
    if (this.#resolveCustomilyPreview(item.properties) || this.#capturedPreviewUrl) {
      return item;
    }

    try {
      const cart = await fetch('/cart.js', { credentials: 'same-origin' }).then((response) => response.json());
      const matchedItem = cart.items?.find(
        (line) =>
          (item.key && line.key === item.key) ||
          (item.variant_id && String(line.variant_id) === String(item.variant_id))
      );

      if (matchedItem) {
        return {
          ...item,
          ...matchedItem,
          properties: {
            ...(item.properties || {}),
            ...(matchedItem.properties || {}),
          },
        };
      }
    } catch {
      // Fall back to the add payload when cart enrichment fails.
    }

    return item;
  }

  /**
   * @param {Record<string, unknown>} data
   * @returns {CartLineItem | null}
   */
  #normalizeCartAddPayload(data) {
    if (Array.isArray(data.items) && data.items.length > 0) {
      return /** @type {CartLineItem} */ (data.items[data.items.length - 1]);
    }

    if (data.variant_id || data.id) {
      return /** @type {CartLineItem} */ (data);
    }

    return this.#getProductFromDom(null);
  }

  /**
   * @param {CartLineItem} item
   */
  #showConfirmationForItem(item) {
    const now = Date.now();
    if (now - this.#lastShownAt < SHOW_DEBOUNCE_MS) return;
    if (this.refs.dialog?.open) return;

    this.#lastShownAt = now;
    this.#populateProductPreview(item);
    this.showDialog();
    this.#scheduleAutoClose();
  }

  #handleDialogOpen = () => {
    document.documentElement.setAttribute('data-atc-confirmation-open', '');
  };

  #handleDialogClose = () => {
    document.documentElement.removeAttribute('data-atc-confirmation-open');
    this.#clearAutoClose();
    this.#capturedPreviewUrl = '';
    this.refs.productImage.onload = null;
    this.refs.productImage.onerror = null;
  };

  /**
   * @param {object} [cart]
   * @param {CartLineItem[]} [cart.items]
   * @param {string | undefined} variantId
   * @returns {CartLineItem | null}
   */
  #resolveAddedItem(cart, variantId) {
    const items = cart?.items;

    if (!Array.isArray(items) || items.length === 0 || !variantId) {
      return null;
    }

    return items.find((item) => String(item.variant_id) === String(variantId)) ?? null;
  }

  /**
   * @param {EventTarget | null} eventTarget
   * @returns {CartLineItem | null}
   */
  #getProductFromDom(eventTarget) {
    const formComponent =
      (eventTarget instanceof Element ? eventTarget.closest('product-form-component') : null) ||
      document.querySelector('product-form-component');

    const title =
      document.querySelector('.sticky-add-to-cart__title')?.textContent?.trim() ||
      formComponent?.querySelector('[data-product-title]')?.textContent?.trim() ||
      document.querySelector('.product-details h1, .text-block h1, .product-title')?.textContent?.trim() ||
      '';

    const imageUrl = this.#resolvePreviewImageUrl();
    const quantityInput = formComponent?.querySelector('[name="quantity"]');
    const quantity = quantityInput instanceof HTMLInputElement ? Number(quantityInput.value) || 1 : 1;
    const priceInCents = this.#resolveDomPriceInCents();

    if (!title && !imageUrl) return null;

    return {
      variant_id: 0,
      product_title: title,
      title,
      image: imageUrl,
      featured_image: imageUrl ? { url: imageUrl } : null,
      properties: {},
      quantity,
      final_price: priceInCents,
    };
  }

  /**
   * @returns {number}
   */
  #resolveDomPriceInCents() {
    const stickyPrice = document.querySelector('.sticky-add-to-cart__price [ref="price"]');
    const priceElement =
      stickyPrice ||
      document.querySelector('[data-testid="product-information"] [ref="price"]') ||
      document.querySelector('.price');

    if (!(priceElement instanceof HTMLElement)) return 0;

    const priceText = priceElement.textContent?.replace(/[^\d.,]/g, '') || '';
    if (!priceText) return 0;

    const normalized = priceText.includes(',') && priceText.includes('.')
      ? priceText.replace(/,/g, '')
      : priceText.replace(',', '.');

    const amount = Number.parseFloat(normalized);
    if (!Number.isFinite(amount)) return 0;

    return Math.round(amount * 100);
  }

  /**
   * @returns {string}
   */
  #resolvePreviewImageUrl() {
    const customilyPreview =
      this.#capturedPreviewUrl ||
      this.#resolveCustomilyPreviewFromDom() ||
      this.#resolvePreviewImageUrlFromGallery();

    if (customilyPreview) return customilyPreview;

    const stickyImage = document.querySelector('.sticky-add-to-cart__image-img');
    if (stickyImage instanceof HTMLImageElement) {
      const stickySrc = stickyImage.currentSrc || stickyImage.src;
      if (stickySrc) return stickySrc;
    }

    return '';
  }

  #captureCustomilyPreviewSnapshot() {
    const previewUrl = this.#resolveCustomilyPreviewFromDom();
    if (!previewUrl) return;

    this.#capturedPreviewUrl = previewUrl;
  }

  /**
   * @returns {string}
   */
  #resolveCustomilyPreviewFromDom() {
    const section = document.querySelector('[data-testid="product-information"]');

    const tempPreview = document.getElementById('cherify-customily-temp-preview');
    if (tempPreview instanceof HTMLImageElement && this.#isUsableImageSrc(tempPreview.currentSrc || tempPreview.src)) {
      return tempPreview.currentSrc || tempPreview.src;
    }

    const galleryImages = section?.querySelectorAll('.customily_gallery_image, .customily_gallery_slide img') || [];
    for (const node of galleryImages) {
      if (!(node instanceof HTMLImageElement)) continue;
      const src = node.currentSrc || node.src;
      if (this.#isUsableImageSrc(src)) return src;
    }

    const canvas = section?.querySelector(
      '.cl-canvas-container canvas.lower-canvas, #preview-canvas canvas.lower-canvas, .variant-picker__personalized-mount canvas.lower-canvas'
    );
    if (canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0) {
      try {
        return canvas.toDataURL('image/png');
      } catch {
        // Canvas may be tainted or unavailable.
      }
    }

    return '';
  }

  /**
   * @returns {string}
   */
  #resolvePreviewImageUrlFromGallery() {
    const galleryImage = document.querySelector(
      '[data-testid="product-information"] slideshow-slide[aria-hidden="false"] img, .product-media-gallery img, .product-media img'
    );
    if (galleryImage instanceof HTMLImageElement) {
      const gallerySrc = galleryImage.currentSrc || galleryImage.src;
      if (this.#isUsableImageSrc(gallerySrc)) return gallerySrc;
    }

    return '';
  }

  /**
   * @param {string | undefined} src
   * @returns {boolean}
   */
  #isUsableImageSrc(src) {
    if (!src) return false;
    if (src === window.location.href) return false;
    return !src.endsWith('.gif') || src.startsWith('data:image');
  }

  /**
   * @param {Record<string, string> | undefined} properties
   * @returns {string}
   */
  #resolveCustomilyPreview(properties) {
    if (!properties) return '';

    const direct =
      properties['_customily-preview'] ||
      properties['_customily-thumb'] ||
      properties['_customily-thumbnail'] ||
      properties['_customily_thumb'] ||
      properties['_Preview'] ||
      properties['Preview'] ||
      properties['preview'] ||
      properties['_preview'];

    if (direct && this.#isUsableImageSrc(direct)) return direct;

    for (const [key, value] of Object.entries(properties)) {
      if (!value || !this.#isUsableImageSrc(value)) continue;
      const normalizedKey = key.toLowerCase().replace(/^_+/, '');
      if (
        normalizedKey.includes('preview') ||
        normalizedKey.includes('customily') ||
        normalizedKey.includes('thumbnail') ||
        normalizedKey.includes('thumb')
      ) {
        return value;
      }
    }

    return '';
  }

  /**
   * @param {CartLineItem} item
   * @returns {string}
   */
  #resolveProductImageUrl(item) {
    return (
      this.#resolveCustomilyPreview(item.properties) ||
      this.#capturedPreviewUrl ||
      this.#resolvePreviewImageUrl() ||
      item.image ||
      item.featured_image?.url ||
      ''
    );
  }

  /**
   * @param {CartLineItem} item
   */
  #populateProductPreview(item) {
    const {
      productPreview,
      productImageWrap,
      productImage,
      productTitle,
      productOptions,
      productQuantity,
      productPrice,
    } = this.refs;

    const imageUrl = this.#resolveProductImageUrl(item);
    const title = this.#resolveProductTitle(item);
    const quantity = item.quantity ?? 1;
    const unitPrice = item.final_price ?? item.price ?? item.line_price ?? 0;

    productPreview.hidden = !title && !imageUrl;

    if (title) {
      productTitle.textContent = title;
      productTitle.hidden = false;
    } else {
      productTitle.textContent = '';
      productTitle.hidden = true;
    }

    this.#populateProductOptions(item, productOptions);
    productQuantity.textContent = String(quantity);
    productPrice.textContent = this.#formatItemPrice(unitPrice);

    if (imageUrl) {
      productImageWrap.hidden = false;
      productImage.alt = title;
      productImage.onload = () => {
        productImageWrap.hidden = false;
      };
      productImage.onerror = () => {
        productImageWrap.hidden = true;
      };
      productImage.src = imageUrl;
    } else {
      productImageWrap.hidden = true;
      productImage.removeAttribute('src');
    }
  }

  /**
   * @param {CartLineItem} item
   * @returns {string}
   */
  #resolveProductTitle(item) {
    const productTitle = item.product_title?.trim();
    if (productTitle) return productTitle;

    const fullTitle = item.title?.trim();
    if (!fullTitle) return '';

    const variantTitle = item.variant_title?.trim();
    if (variantTitle && fullTitle.endsWith(` - ${variantTitle}`)) {
      return fullTitle.slice(0, -(variantTitle.length + 3)).trim();
    }

    return fullTitle;
  }

  /**
   * @param {CartLineItem} item
   * @returns {CartLineOption[]}
   */
  #resolveProductOptions(item) {
    if (Array.isArray(item.options_with_values) && item.options_with_values.length > 0) {
      return item.options_with_values.filter((option) => option?.name && option?.value);
    }

    const stickyVariant = document.querySelector('.sticky-add-to-cart__variant')?.textContent?.trim();
    if (stickyVariant) {
      const values = stickyVariant.split('/').map((part) => part.trim()).filter(Boolean);
      if (values.length > 0) {
        return values.map((value, index) => ({
          name: `Option ${index + 1}`,
          value,
        }));
      }
    }

    const variantTitle = item.variant_title?.trim();
    if (variantTitle && variantTitle !== 'Default Title') {
      const values = variantTitle.split('/').map((part) => part.trim()).filter(Boolean);
      if (values.length > 1) {
        return values.map((value, index) => ({
          name: `Option ${index + 1}`,
          value,
        }));
      }

      return [{ name: 'Variant', value: variantTitle }];
    }

    /** @type {CartLineOption[]} */
    const legacyOptions = [];
    if (item.option1) legacyOptions.push({ name: 'Option 1', value: item.option1 });
    if (item.option2) legacyOptions.push({ name: 'Option 2', value: item.option2 });
    if (item.option3) legacyOptions.push({ name: 'Option 3', value: item.option3 });
    return legacyOptions;
  }

  /**
   * @param {CartLineItem} item
   * @param {HTMLElement} productOptions
   */
  #populateProductOptions(item, productOptions) {
    productOptions.replaceChildren();

    for (const option of this.#resolveProductOptions(item)) {
      const row = document.createElement('div');
      row.className = 'atc-confirmation-dialog__option';

      const label = document.createElement('span');
      label.className = 'atc-confirmation-dialog__option-label';
      label.textContent = `${option.name}: `;

      const value = document.createElement('span');
      value.className = 'atc-confirmation-dialog__option-value';
      value.textContent = option.value;

      row.append(label, value);
      productOptions.append(row);
    }
  }

  /**
   * @param {number} priceInCents
   * @returns {string}
   */
  #formatItemPrice(priceInCents) {
    const moneyFormat = this.dataset.moneyFormat || '${{amount}}';
    const currency = this.dataset.currency || Shopify.currency.active || 'USD';
    const formatted = formatMoney(Number(priceInCents) || 0, moneyFormat, currency);

    if (this.dataset.showCurrencyCode === 'true') {
      return `${formatted} ${currency}`;
    }

    return formatted;
  }

  #scheduleAutoClose() {
    this.#clearAutoClose();

    if (this.dataset.autoClose !== 'true') return;

    const delaySeconds = Number(this.dataset.autoCloseDelay || 5);
    const delayMs = Number.isFinite(delaySeconds) && delaySeconds > 0 ? delaySeconds * 1000 : 5000;

    this.#autoCloseTimeout = window.setTimeout(() => {
      if (this.refs.dialog?.open) {
        this.closeDialog();
      }
    }, delayMs);
  }

  #clearAutoClose = () => {
    if (this.#autoCloseTimeout !== undefined) {
      clearTimeout(this.#autoCloseTimeout);
      this.#autoCloseTimeout = undefined;
    }
  };
}

if (!customElements.get('atc-confirmation-dialog')) {
  customElements.define('atc-confirmation-dialog', ATCConfirmationDialog);
}

ATCConfirmationDialog.installNetworkInterceptors();
