/**
 * Sticky bar keeps theme "Add to cart" (clicks main ATC in product info via sticky-add-to-cart.js).
 * When stuck + Customily preview exists: thumbnail in .sticky-add-to-cart__image opens preview.
 */
(function () {
  'use strict';

  const SECTION_SEL = '[data-testid="product-information"]';

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

  /** @returns {HTMLElement | null} */
  function getBar() {
    return document.querySelector('.sticky-add-to-cart__bar');
  }

  /** @returns {HTMLElement | null} */
  function getStickyRoot() {
    return document.querySelector('sticky-add-to-cart');
  }

  function thumbAriaLabel() {
    const root = getStickyRoot();
    const fromData = root?.dataset?.cherifyStickyThumbAria?.trim();
    return fromData || 'View personalization preview';
  }

  function syncThumbAffordance() {
    const bar = getBar();
    if (!bar) return;
    const wrap = bar.querySelector('.sticky-add-to-cart__image');
    if (!wrap) return;

    const preview = getPreviewButton();
    const stuck = bar.getAttribute('data-stuck') === 'true';
    const active = Boolean(stuck && preview);

    bar.classList.toggle('cherify-sticky-thumb-preview--active', active);

    if (active) {
      wrap.setAttribute('role', 'button');
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', thumbAriaLabel());
    } else {
      wrap.removeAttribute('role');
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('aria-label');
    }
  }

  /**
   * @param {Event} e
   */
  function onStickyClick(e) {
    if (!(e.target instanceof Element)) return;
    const bar = e.target.closest('.sticky-add-to-cart__bar');
    if (!bar || bar.getAttribute('data-stuck') !== 'true') return;
    if (!e.target.closest('.sticky-add-to-cart__image')) return;

    const preview = getPreviewButton();
    if (!preview || preview.disabled) return;

    e.preventDefault();
    preview.click();
  }

  /**
   * @param {KeyboardEvent} e
   */
  function onStickyKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!(e.target instanceof Element)) return;
    const wrap = e.target.closest('.sticky-add-to-cart__image');
    if (!wrap) return;
    const bar = wrap.closest('.sticky-add-to-cart__bar');
    if (!bar || bar.getAttribute('data-stuck') !== 'true') return;

    const preview = getPreviewButton();
    if (!preview || preview.disabled) return;

    e.preventDefault();
    preview.click();
  }

  let moBar = null;
  let moSec = null;
  let t = 0;

  function scheduleSync() {
    window.cancelAnimationFrame(t);
    t = window.requestAnimationFrame(() => syncThumbAffordance());
  }

  function init() {
    const root = getStickyRoot();
    const bar = getBar();
    if (!root || !bar) return;

    root.addEventListener('click', onStickyClick);
    root.addEventListener('keydown', onStickyKeyDown);

    moBar = new MutationObserver(scheduleSync);
    moBar.observe(bar, {
      attributes: true,
      attributeFilter: ['data-stuck'],
      childList: true,
      subtree: false,
    });

    const sec = getSection();
    if (sec) {
      moSec = new MutationObserver(() => scheduleSync());
      moSec.observe(sec, { childList: true, subtree: true });
    }

    document.addEventListener('scroll', scheduleSync, { passive: true, capture: true });
    syncThumbAffordance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
