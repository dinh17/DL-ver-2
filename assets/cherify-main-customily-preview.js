/**
 * PDP main Customily preview lock.
 * If the main preview canvas is visible in media slide #1, lock slideshow drag
 * and hide slideshow controls. For products without Customily, no-op/fallback.
 * Blocks dblclick / double-tap on Fabric.js `.upper-canvas` (cannot unregister Customily handlers).
 */
(function () {
  'use strict';

  /** Mobile: two taps within this window count as double-tap (no native dblclick). */
  const UPPER_CANVAS_DOUBLE_TAP_MS = 350;

  const SECTION_SEL = '[data-testid="product-information"]';
  const MEDIA_HOST_SEL = '.product-information__media';
  const SLIDESHOW_SEL = `${MEDIA_HOST_SEL} slideshow-component`;
  const PREVIEW_VISIBLE_SEL = [
    `${MEDIA_HOST_SEL} slideshow-slide:first-child .cl-canvas-container canvas`,
    `${MEDIA_HOST_SEL} slideshow-slide:first-child #preview-canvas`,
    `${MEDIA_HOST_SEL} slideshow-slide:first-child .variant-picker__personalized-mount canvas`,
  ].join(', ');
  const PREVIEW_SURFACE_SEL = [
    `${MEDIA_HOST_SEL} slideshow-slide:first-child .cl-canvas-container`,
    `${MEDIA_HOST_SEL} slideshow-slide:first-child #preview-canvas`,
    `${MEDIA_HOST_SEL} slideshow-slide:first-child .variant-picker__personalized-mount`,
  ].join(', ');
  const CANVAS_CONTAINER_SEL = `${MEDIA_HOST_SEL} slideshow-slide:first-child .cl-canvas-container`;
  const CUSTOMILY_DATE_INPUT_SEL = '.c-datepicker__input[type="date"]';

  /**
   * Fabric upper canvas (event.target is often wrong on iOS; composedPath catches retargeting).
   * @param {EventTarget | null} target
   * @param {Event | undefined} event
   * @returns {HTMLCanvasElement | null}
   */
  function resolveUpperCanvas(target, event) {
    if (event && typeof event.composedPath === 'function') {
      for (const node of event.composedPath()) {
        if (node instanceof HTMLCanvasElement && node.classList.contains('upper-canvas')) {
          return node;
        }
      }
    }
    if (!(target instanceof Element)) return null;
    const el = target.closest('.upper-canvas');
    return el instanceof HTMLCanvasElement ? el : null;
  }

  /** @param {Element | null} el */
  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const styles = getComputedStyle(el);
    return styles.display !== 'none' && styles.visibility !== 'hidden' && styles.opacity !== '0';
  }

  function init() {
    const section = document.querySelector(SECTION_SEL);
    if (!(section instanceof HTMLElement)) return;

    const mediaHost = section.querySelector(MEDIA_HOST_SEL);
    const slideshow = section.querySelector(SLIDESHOW_SEL);
    if (!(mediaHost instanceof HTMLElement) || !(slideshow instanceof HTMLElement)) return;

    const openDatePicker = (input) => {
      if (!(input instanceof HTMLInputElement) || input.disabled) return;

      try {
        input.focus({ preventScroll: true });
      } catch (error) {
        input.focus();
      }

      if (typeof input.showPicker !== 'function') return;

      try {
        input.showPicker();
      } catch (error) {
        // Browsers only allow showPicker during trusted user gestures.
      }
    };

    const enhanceDateInput = (input) => {
      if (!(input instanceof HTMLInputElement) || input.dataset.cherifyDatePickerEnhanced === 'true') return;

      input.dataset.cherifyDatePickerEnhanced = 'true';
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'none');
      input.style.cursor = 'pointer';

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') return;
        event.preventDefault();
        if (event.key === 'Enter' || event.key === ' ') openDatePicker(input);
      });

      input.addEventListener('beforeinput', (event) => event.preventDefault());
      input.addEventListener('paste', (event) => event.preventDefault());
      input.addEventListener('drop', (event) => event.preventDefault());
      input.addEventListener('click', () => openDatePicker(input));
      input.addEventListener('focus', () => openDatePicker(input));
    };

    const enhanceDateInputs = () => {
      section.querySelectorAll(CUSTOMILY_DATE_INPUT_SEL).forEach(enhanceDateInput);
    };

    let frame = 0;
    const initialDisabled = slideshow.getAttribute('disabled');
    const ZOOM_TRIGGER_ATTR = 'on:click';
    const ZOOM_TRIGGER_BACKUP_ATTR = 'data-cherify-zoom-trigger';

    /**
     * @param {boolean} active
     */
    const syncSlideZoomTrigger = (active) => {
      const surfaces = section.querySelectorAll(PREVIEW_SURFACE_SEL);
      const slides = new Set();
      for (const surface of surfaces) {
        const slide = surface.closest('slideshow-slide');
        if (slide instanceof HTMLElement) slides.add(slide);
      }

      slides.forEach((slide) => {
        if (active) {
          const trigger = slide.getAttribute(ZOOM_TRIGGER_ATTR);
          if (trigger) {
            slide.setAttribute(ZOOM_TRIGGER_BACKUP_ATTR, trigger);
            slide.removeAttribute(ZOOM_TRIGGER_ATTR);
          }
          return;
        }

        const backup = slide.getAttribute(ZOOM_TRIGGER_BACKUP_ATTR);
        if (backup) {
          slide.setAttribute(ZOOM_TRIGGER_ATTR, backup);
          slide.removeAttribute(ZOOM_TRIGGER_BACKUP_ATTR);
        }
      });
    };

    const applyState = () => {
      enhanceDateInputs();

      /** Canvas moved into Edit Photo dialog — keep slideshow locked; skip visibility probe (avoids mutation thrash). */
      if (document.body.classList.contains('cherify-customily-editor-open')) {
        mediaHost.classList.add('cherify-main-preview-active');
        syncSlideZoomTrigger(true);
        slideshow.setAttribute('disabled', 'true');
        return;
      }

      const previewCanvas = section.querySelector(PREVIEW_VISIBLE_SEL);
      const active = isVisible(previewCanvas);

      mediaHost.classList.toggle('cherify-main-preview-active', active);
      syncSlideZoomTrigger(active);

      if (active) {
        slideshow.setAttribute('disabled', 'true');
      } else if (initialDisabled == null) {
        slideshow.removeAttribute('disabled');
      } else {
        slideshow.setAttribute('disabled', initialDisabled);
      }
    };

    /**
     * Prevent slideshow slide click handler from opening zoom dialog while editing Customily canvas.
     * The zoom trigger lives on slideshow-slide via `on:click="#zoom-dialog.../open/..."`
     * so we must intercept at capture phase inside the canvas container.
     * @param {Event} event
     */
    const blockZoomOpenWhileCustomizing = (event) => {
      if (!mediaHost.classList.contains('cherify-main-preview-active')) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (document.body.classList.contains('cherify-customily-editor-open')) {
        if (target.closest('#cherify-customily-native-dialog .cl-canvas-container')) {
          event.preventDefault();
          event.stopPropagation();
          if ('stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
        }
        return;
      }
      if (!target.closest(CANVAS_CONTAINER_SEL)) return;
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event && typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };

    const scheduleApply = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        applyState();
      });
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(section, { childList: true, subtree: true, attributes: true });

    section.addEventListener('click', scheduleApply, { capture: true });
    section.addEventListener('pointerdown', scheduleApply, { capture: true });
    section.addEventListener('click', blockZoomOpenWhileCustomizing, { capture: true });

    /**
     * Document capture runs before Fabric/Customily listeners on the canvas.
     * @param {MouseEvent} event
     */
    const blockUpperCanvasDblclick = (event) => {
      const upper = resolveUpperCanvas(event.target, event);
      if (!upper || !section.contains(upper)) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('dblclick', blockUpperCanvasDblclick, true);

    /** Same as dblclick on mobile: block 2nd clean tap (no drag between down/up). */
    /** @type {{ time: number, el: HTMLCanvasElement | null }} */
    let lastCleanUpperTap = { time: 0, el: null };
    let upperTouchGestureMoved = false;
    /** @type {{ id: number; x: number; y: number; upper: HTMLCanvasElement } | null} */
    let upperTouchTrack = null;

    const resetDoubleTapChain = () => {
      lastCleanUpperTap = { time: 0, el: null };
    };

    const resetUpperTouchTrack = () => {
      upperTouchTrack = null;
    };

    const onDocTouchStart = (event) => {
      if (event.touches.length >= 2) {
        resetDoubleTapChain();
        resetUpperTouchTrack();
        return;
      }
      const t = event.changedTouches[0];
      if (!t) return;
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const upper = resolveUpperCanvas(el, event);
      if (upper && section.contains(upper)) {
        upperTouchGestureMoved = false;
        upperTouchTrack = { id: t.identifier, x: t.clientX, y: t.clientY, upper };
      } else {
        resetUpperTouchTrack();
      }
    };

    const onDocTouchMove = (event) => {
      if (!upperTouchTrack) return;
      let t = null;
      for (let i = 0; i < event.touches.length; i++) {
        if (event.touches[i].identifier === upperTouchTrack.id) {
          t = event.touches[i];
          break;
        }
      }
      if (!t) return;
      const dx = Math.abs(t.clientX - upperTouchTrack.x);
      const dy = Math.abs(t.clientY - upperTouchTrack.y);
      if (dx > 10 || dy > 10) upperTouchGestureMoved = true;
    };

    const onDocTouchCancel = () => {
      resetDoubleTapChain();
      resetUpperTouchTrack();
    };

    const onDocTouchEnd = (event) => {
      if (event.touches.length > 0) return;
      if (event.changedTouches.length !== 1) {
        resetDoubleTapChain();
        resetUpperTouchTrack();
        return;
      }

      const t = event.changedTouches[0];
      if (!upperTouchTrack || t.identifier !== upperTouchTrack.id) {
        return;
      }

      const el = document.elementFromPoint(t.clientX, t.clientY);
      const upper = resolveUpperCanvas(el, event);
      if (!upper || !section.contains(upper) || upper !== upperTouchTrack.upper) {
        resetUpperTouchTrack();
        return;
      }

      resetUpperTouchTrack();

      if (upperTouchGestureMoved) {
        resetDoubleTapChain();
        return;
      }

      const now = Date.now();
      const same = lastCleanUpperTap.el === upper;
      const quick = now - lastCleanUpperTap.time < UPPER_CANVAS_DOUBLE_TAP_MS;

      if (quick && same) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        resetDoubleTapChain();
        return;
      }

      lastCleanUpperTap = { time: now, el: upper };
    };

    document.addEventListener('touchstart', onDocTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onDocTouchMove, { capture: true, passive: true });
    document.addEventListener('touchcancel', onDocTouchCancel, { capture: true, passive: true });
    document.addEventListener('touchend', onDocTouchEnd, { capture: true, passive: false });

    window.addEventListener('resize', scheduleApply);

    applyState();
    enhanceDateInputs();

    // Return cleanup function for Shopify section re-render
    return function destroy() {
      observer.disconnect();
      document.removeEventListener('dblclick', blockUpperCanvasDblclick, true);
      document.removeEventListener('touchstart', onDocTouchStart, { capture: true, passive: true });
      document.removeEventListener('touchmove', onDocTouchMove, { capture: true, passive: true });
      document.removeEventListener('touchcancel', onDocTouchCancel, { capture: true, passive: true });
      document.removeEventListener('touchend', onDocTouchEnd, { capture: true, passive: false });
      section.removeEventListener('click', scheduleApply, { capture: true });
      section.removeEventListener('pointerdown', scheduleApply, { capture: true });
      section.removeEventListener('click', blockZoomOpenWhileCustomizing, { capture: true });
      window.removeEventListener('resize', scheduleApply);
      if (frame) cancelAnimationFrame(frame);
    };
  }

  const cleanup = init();
  if (cleanup) {
    window.__cherifyMainPreviewCleanup = cleanup;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const c = init();
      if (c) window.__cherifyMainPreviewCleanup = c;
    }, { once: true });
  }
})();
