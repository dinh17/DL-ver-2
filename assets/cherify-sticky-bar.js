/**
 * Cherify sticky bar: layout (none | card | big_button), preview visibility, primary CTA (preview | atc).
 */
(function () {
  'use strict';

  const SECTION_SEL = '[data-testid="product-information"]';
  const MOBILE_MQ = window.matchMedia('(max-width: 749px)');
  const LAYOUT_CLASSES = ['cherify-sticky-active--none', 'cherify-sticky-active--card', 'cherify-sticky-active--big-button'];

  /** @type {boolean} */
  let mainPreviewOnScreen = false;

  /** @type {IntersectionObserver | null} */
  let previewIntersectionObserver = null;

  /** @returns {HTMLElement | null} */
  function getSection() {
    return document.querySelector(SECTION_SEL);
  }

  /** @returns {HTMLButtonElement | null} */
  function getPreviewButton() {
    const sec = getSection();
    if (!sec) return null;
    const el =
      sec.querySelector('#customily-preview-button') || sec.querySelector('button.customily-preview-button');
    return el instanceof HTMLButtonElement && el.isConnected ? el : null;
  }

  function syncPreviewOnScreenState() {
    const preview = getPreviewButton();
    if (!preview) {
      mainPreviewOnScreen = false;
      return;
    }
    const rect = preview.getBoundingClientRect();
    const styles = getComputedStyle(preview);
    if (styles.display === 'none' || styles.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
      mainPreviewOnScreen = false;
      return;
    }
    mainPreviewOnScreen =
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth;
  }

  function teardownPreviewObserver() {
    previewIntersectionObserver?.disconnect();
    previewIntersectionObserver = null;
    mainPreviewOnScreen = false;
  }

  function ensurePreviewObserver() {
    const preview = getPreviewButton();
    if (!preview) {
      teardownPreviewObserver();
      return;
    }

    syncPreviewOnScreenState();

    if (previewIntersectionObserver) return;

    previewIntersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        mainPreviewOnScreen = Boolean(entry?.isIntersecting);
        refreshAll();
      },
      { threshold: 0, rootMargin: '0px 0px -1px 0px' }
    );
    previewIntersectionObserver.observe(preview);
  }

  /**
   * @param {HTMLElement} root
   * @returns {'none' | 'card' | 'big_button'}
   */
  function getActiveLayout(root) {
    const desktop = root.dataset.stickyLayoutDesktop || 'big_button';
    const mobile = root.dataset.stickyLayoutMobile || 'big_button';
    const layout = MOBILE_MQ.matches ? mobile : desktop;
    if (layout === 'none' || layout === 'card' || layout === 'big_button') return layout;
    return 'big_button';
  }

  /**
   * @param {HTMLElement} root
   * @returns {'always' | 'when_off_screen'}
   */
  function getPreviewVisibilityMode(root) {
    const mode = root.dataset.stickyPreviewVisibility || 'when_off_screen';
    return mode === 'always' ? 'always' : 'when_off_screen';
  }

  /**
   * @param {HTMLElement} root
   * @returns {'preview' | 'atc'}
   */
  function resolvePrimaryMode(root) {
    const preview = getPreviewButton();
    if (!preview || preview.disabled) return 'atc';

    if (getPreviewVisibilityMode(root) === 'always') return 'preview';

    return mainPreviewOnScreen ? 'atc' : 'preview';
  }

  /**
   * @param {HTMLElement} root
   * @param {'none' | 'card' | 'big_button'} layout
   */
  function applyLayoutClass(root, layout) {
    root.classList.remove(...LAYOUT_CLASSES);
    if (layout === 'none') {
      root.classList.add('cherify-sticky-active--none');
      root.setAttribute('hidden', '');
      return;
    }
    root.removeAttribute('hidden');
    root.classList.add(layout === 'card' ? 'cherify-sticky-active--card' : 'cherify-sticky-active--big-button');
  }

  /**
   * @param {HTMLElement} root
   * @param {'preview' | 'atc'} mode
   */
  function applyPrimaryActionUI(root, mode) {
    root.dataset.primaryActionResolved = mode;
    const btn = root.querySelector('[ref="addToCartButton"]');
    if (!(btn instanceof HTMLButtonElement)) return;

    if (mode === 'preview') {
      const layout = getActiveLayout(root);
      const previewLabel =
        layout === 'big_button'
          ? btn.querySelector('[data-cherify-sticky-preview-label="big-button"]')
          : btn.querySelector('[data-cherify-sticky-preview-label="card"]');
      btn.setAttribute('aria-label', previewLabel?.textContent?.trim() || 'Preview');
    } else {
      const label = btn.querySelector('[data-cherify-sticky-atc-label]')?.textContent?.trim();
      if (label) btn.setAttribute('aria-label', label);
      else btn.removeAttribute('aria-label');
    }
  }

  /**
   * @param {HTMLElement} root
   */
  function applyStickyState(root) {
    applyLayoutClass(root, getActiveLayout(root));
    applyPrimaryActionUI(root, resolvePrimaryMode(root));
  }

  /**
   * @param {HTMLElement | null | undefined} root
   */
  function initSticky(root) {
    if (!(root instanceof HTMLElement)) return;
    ensurePreviewObserver();
    applyStickyState(root);
  }

  function refreshAll() {
    ensurePreviewObserver();
    document.querySelectorAll('sticky-add-to-cart').forEach((el) => {
      if (el instanceof HTMLElement) applyStickyState(el);
    });
  }

  let sectionObserver = null;

  function watchCustomily() {
    const sec = getSection();
    if (!sec || sectionObserver) return;
    sectionObserver = new MutationObserver(() => {
      teardownPreviewObserver();
      refreshAll();
    });
    sectionObserver.observe(sec, { childList: true, subtree: true });
  }

  MOBILE_MQ.addEventListener('change', refreshAll);

  window.CherifyStickyBar = {
    initSticky,
    resolvePrimaryMode,
    getActiveLayout,
    refreshAll,
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        refreshAll();
        watchCustomily();
      },
      { once: true }
    );
  } else {
    refreshAll();
    watchCustomily();
  }
})();
