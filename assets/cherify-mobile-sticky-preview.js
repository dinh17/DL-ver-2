/**
 * Mobile PDP: fixed preview bar over the header while the viewport is in the
 * variant / personalization stack, after the media gallery has scrolled away
 * and before the product-details column has scrolled past.
 */
(function () {
  'use strict';

  const MOBILE_MQ = '(max-width: 749px)';
  const SECTION_SEL = '[data-testid="product-information"]';
  /** 5 discrete levels; scale = (1 + z) × contain; step 0.45 between nấc */
  const ZOOM_LEVEL_COUNT = 5;
  const ZOOM_OFFSETS = [0, 0.45, 0.9, 1.35, 1.8];
  const DOUBLE_TAP_MS = 320;

  function pinchZMax() {
    return ZOOM_OFFSETS[ZOOM_LEVEL_COUNT - 1];
  }

  /** @param {number} z */
  function nearestLevelIndex(z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < ZOOM_LEVEL_COUNT; i++) {
      const d = Math.abs(ZOOM_OFFSETS[i] - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * @param {Touch} a
   * @param {Touch} b
   */
  function touchDistance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  /**
   * @param {HTMLElement} section
   * @returns {HTMLCanvasElement | null}
   */
  function findSourceCanvas(section) {
    return (
      section.querySelector('.variant-picker__personalized-mount canvas') ||
      section.querySelector('.cl-canvas-container canvas') ||
      section.querySelector('#preview-canvas') ||
      null
    );
  }

  /**
   * Source canvas must exist, be connected, and have drawable dimensions (Customily ready).
   *
   * @param {HTMLElement} section
   * @returns {HTMLCanvasElement | null}
   */
  function getTrackableSourceCanvas(section) {
    const el = findSourceCanvas(section);
    if (!el || !(el instanceof HTMLCanvasElement)) return null;
    if (!el.isConnected) return null;
    if (el.width < 1 || el.height < 1) return null;
    return el;
  }

  /**
   * @param {HTMLCanvasElement} dest
   * @param {HTMLElement} section
   */
  function syncCanvas(dest, section) {
    const src = getTrackableSourceCanvas(section);
    const viewport = dest.closest('.cherify-mobile-sticky-preview__viewport');
    const inner = dest.closest('.cherify-mobile-sticky-preview__inner');
    if (!src || !viewport || !inner || !src.width || !src.height) return;

    const boxW = viewport.clientWidth || 360;
    let boxH = viewport.clientHeight;
    if (boxH < 8) {
      boxH = viewport.getBoundingClientRect().height || 260;
    }
    const scaleContain = Math.min(boxW / src.width, boxH / src.height);
    const z = readZoom(inner);
    const mult = 1 + z;
    let cssW = Math.round(src.width * scaleContain * mult);
    let cssH = Math.round(src.height * scaleContain * mult);
    const maxEdge = Math.max(boxW, boxH) * 3.4;
    const longest = Math.max(cssW, cssH);
    if (longest > maxEdge) {
      const r = maxEdge / longest;
      cssW = Math.round(cssW * r);
      cssH = Math.round(cssH * r);
    }
    const dpr = window.devicePixelRatio || 1;
    const bufW = Math.max(1, Math.round(cssW * dpr));
    const bufH = Math.max(1, Math.round(cssH * dpr));

    dest.style.width = `${cssW}px`;
    dest.style.height = `${cssH}px`;

    if (dest.width !== bufW || dest.height !== bufH) {
      dest.width = bufW;
      dest.height = bufH;
    }

    const ctx = dest.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);
    try {
      ctx.drawImage(src, 0, 0, cssW, cssH);
    } catch {
      /* tainted or cross-origin canvas */
    }
  }

  /**
   * @param {HTMLElement} inner
   * @returns {number} level index 0 .. ZOOM_LEVEL_COUNT - 1
   */
  function readZoomLevel(inner) {
    let lv = parseInt(String(inner?.dataset.chPreviewZoomLevel ?? ''), 10);
    if (Number.isFinite(lv) && lv >= 0 && lv < ZOOM_LEVEL_COUNT) {
      return lv;
    }
    const legacy = parseFloat(String(inner?.dataset.chPreviewZoom ?? ''));
    if (Number.isFinite(legacy)) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < ZOOM_LEVEL_COUNT; i++) {
        const d = Math.abs(ZOOM_OFFSETS[i] - legacy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }
    return 0;
  }

  /**
   * @param {HTMLElement} inner
   * @returns {number} z offset for scale (1 + z)
   */
  function readZoom(inner) {
    const live = parseFloat(String(inner?.dataset.chPreviewZoomLive ?? ''));
    if (Number.isFinite(live)) {
      const zMax = pinchZMax();
      return Math.max(0, Math.min(zMax, live));
    }
    return ZOOM_OFFSETS[readZoomLevel(inner)];
  }

  /**
   * @param {HTMLElement} inner
   * @param {number} level
   * @param {HTMLButtonElement} zoomOut
   * @param {HTMLButtonElement} zoomIn
   */
  function setZoomLevel(inner, level, zoomOut, zoomIn) {
    const lv = Math.min(ZOOM_LEVEL_COUNT - 1, Math.max(0, Math.round(level)));
    inner.dataset.chPreviewZoomLevel = String(lv);
    delete inner.dataset.chPreviewZoom;
    delete inner.dataset.chPreviewZoomLive;
    zoomOut.disabled = lv <= 0;
    zoomIn.disabled = lv >= ZOOM_LEVEL_COUNT - 1;
  }

  function init() {
    const el = document.querySelector('[data-cherify-mobile-sticky-preview]');
    if (!el) return;

    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }

    const canvas = el.querySelector('.cherify-mobile-sticky-preview__canvas');
    const inner = el.querySelector('.cherify-mobile-sticky-preview__inner');
    const zoomOut = el.querySelector('[data-cherify-mobile-preview-zoom="out"]');
    const zoomIn = el.querySelector('[data-cherify-mobile-preview-zoom="in"]');
    const closeBtn = el.querySelector('[data-cherify-mobile-preview-close]');

    if (!canvas || !inner || !zoomOut || !zoomIn) return;

    const viewport = el.querySelector('.cherify-mobile-sticky-preview__viewport');
    if (!viewport) return;

    /**
     * @param {EventTarget | null} target
     */
    function isChromeTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      return !!(
        target.closest('.cherify-mobile-sticky-preview__zoom') ||
        target.closest('[data-cherify-mobile-preview-close]')
      );
    }

    /**
     * @param {HTMLElement} vp
     */
    function centerScroll(vp) {
      requestAnimationFrame(() => {
        vp.scrollLeft = Math.max(0, (vp.scrollWidth - vp.clientWidth) / 2);
        vp.scrollTop = Math.max(0, (vp.scrollHeight - vp.clientHeight) / 2);
      });
    }

    /**
     * @param {HTMLElement} vp
     */
    function clampScrollViewport(vp) {
      const maxL = Math.max(0, vp.scrollWidth - vp.clientWidth);
      const maxT = Math.max(0, vp.scrollHeight - vp.clientHeight);
      vp.scrollLeft = Math.min(maxL, Math.max(0, vp.scrollLeft));
      vp.scrollTop = Math.min(maxT, Math.max(0, vp.scrollTop));
    }

    /**
     * Midpoint of two touches in viewport-local coordinates (for zoom focal point).
     *
     * @param {HTMLElement} vp
     * @param {Touch} a
     * @param {Touch} b
     */
    function pinchFocalLocal(vp, a, b) {
      const r = vp.getBoundingClientRect();
      const cx = (a.clientX + b.clientX) / 2 - r.left;
      const cy = (a.clientY + b.clientY) / 2 - r.top;
      return { cx, cy };
    }

    let userDismissed = false;
    let lastLogicalShow = false;
    let ticking = false;

    /**
     * Draw mirrored canvas immediately (same turn). Mobile WebKit often defers rAF
     * until scroll/gesture ends; sync here avoids stale preview after pinch/zoom.
     */
    function syncPreviewCanvasIfVisible() {
      if (!window.matchMedia(MOBILE_MQ).matches) return;
      const sec = document.querySelector(SECTION_SEL);
      if (!sec || !canvas) return;
      if (!el.classList.contains('cherify-mobile-sticky-preview--visible')) return;
      if (!getTrackableSourceCanvas(sec)) return;
      syncCanvas(canvas, sec);
    }

    const run = () => {
      ticking = false;

      if (document.body.classList.contains('cherify-customily-editor-open')) {
        el.classList.remove('cherify-mobile-sticky-preview--visible');
        el.setAttribute('aria-hidden', 'true');
        return;
      }

      const mq = window.matchMedia(MOBILE_MQ);
      const section = document.querySelector(SECTION_SEL);

      if (!mq.matches || !section) {
        el.classList.remove('cherify-mobile-sticky-preview--visible');
        el.setAttribute('aria-hidden', 'true');
        lastLogicalShow = false;
        return;
      }

      const media = section.querySelector('.product-information__media');
      const details = section.querySelector('.product-details');
      if (!media || !details) {
        el.classList.remove('cherify-mobile-sticky-preview--visible');
        el.setAttribute('aria-hidden', 'true');
        lastLogicalShow = false;
        return;
      }

      const stack = section.querySelector('.cherify-variant-picker-stack');
      const mediaRect = media.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const vh = window.innerHeight;

      const carouselPast = mediaRect.bottom <= 0;
      const pastDetails = detailsRect.bottom <= 0;

      let inVariantZone = true;
      if (stack) {
        const sr = stack.getBoundingClientRect();
        inVariantZone = sr.bottom > 0 && sr.top < vh;
      }

      const logicalShow = carouselPast && !pastDetails && inVariantZone;

      if (!logicalShow && lastLogicalShow) {
        userDismissed = false;
      }
      lastLogicalShow = logicalShow;

      const trackable = getTrackableSourceCanvas(section) != null;
      const visible = logicalShow && !userDismissed && trackable;

      el.classList.toggle('cherify-mobile-sticky-preview--visible', visible);
      el.setAttribute('aria-hidden', visible ? 'false' : 'true');

      if (visible && canvas) {
        syncCanvas(canvas, section);
      }
    };

    const schedule = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(run);
      }
    };

    function toggleDoubleZoom() {
      const lv = readZoomLevel(inner);
      if (lv > 0) {
        setZoomLevel(inner, 0, zoomOut, zoomIn);
        centerScroll(viewport);
      } else {
        setZoomLevel(inner, ZOOM_LEVEL_COUNT - 1, zoomOut, zoomIn);
        centerScroll(viewport);
      }
      syncPreviewCanvasIfVisible();
      schedule();
    }

    let panning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartSL = 0;
    let panStartST = 0;

    viewport.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      if (isChromeTarget(e.target)) return;
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartSL = viewport.scrollLeft;
      panStartST = viewport.scrollTop;
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('cherify-mobile-sticky-preview__viewport--grabbing');
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!panning || e.pointerType === 'touch') return;
      viewport.scrollLeft = panStartSL - (e.clientX - panStartX);
      viewport.scrollTop = panStartST - (e.clientY - panStartY);
    });

    function endPan(e) {
      if (!panning) return;
      panning = false;
      viewport.classList.remove('cherify-mobile-sticky-preview__viewport--grabbing');
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }
    }

    viewport.addEventListener('pointerup', endPan);
    viewport.addEventListener('pointercancel', endPan);

    viewport.addEventListener('dblclick', (e) => {
      if (isChromeTarget(e.target)) return;
      e.preventDefault();
      toggleDoubleZoom();
    });

    let lastTouchEnd = 0;
    /** @type {{ lastDist: number, lastMult: number } | null} */
    let pinchState = null;

    viewport.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 2 || isChromeTarget(e.target)) return;
        const d = touchDistance(e.touches[0], e.touches[1]);
        if (d < 10) return;
        delete inner.dataset.chPreviewZoomLive;
        const z0 = readZoom(inner);
        pinchState = {
          lastDist: d,
          lastMult: 1 + z0,
        };
        viewport.classList.add('cherify-mobile-sticky-preview__viewport--pinching');
      },
      { passive: true }
    );

    viewport.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2 || !pinchState) return;
        if (pinchState.lastDist < 6) return;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const d = touchDistance(t0, t1);
        e.preventDefault();
        const ratioRaw = d / pinchState.lastDist;
        const zMax = pinchZMax();
        const multMax = 1 + zMax;
        let newMult = pinchState.lastMult * ratioRaw;
        newMult = Math.max(1, Math.min(multMax, newMult));
        const ratioApplied = newMult / pinchState.lastMult;
        const newZ = newMult - 1;

        const { cx, cy } = pinchFocalLocal(viewport, t0, t1);
        const sl = viewport.scrollLeft;
        const st = viewport.scrollTop;
        const padX0 = canvas.offsetLeft;
        const padY0 = canvas.offsetTop;
        const w0 = canvas.clientWidth;
        const h0 = canvas.clientHeight;

        inner.dataset.chPreviewZoomLive = String(newZ);
        syncPreviewCanvasIfVisible();

        const padX1 = canvas.offsetLeft;
        const padY1 = canvas.offsetTop;
        if (w0 >= 1 && h0 >= 1) {
          viewport.scrollLeft = padX1 + (sl + cx - padX0) * ratioApplied - cx;
          viewport.scrollTop = padY1 + (st + cy - padY0) * ratioApplied - cy;
        } else {
          viewport.scrollLeft = (sl + cx) * ratioApplied - cx;
          viewport.scrollTop = (st + cy) * ratioApplied - cy;
        }
        clampScrollViewport(viewport);

        pinchState.lastDist = d;
        pinchState.lastMult = newMult;

        schedule();
      },
      { passive: false }
    );

    function handleTouchEndPinchOrTap(e) {
      if (isChromeTarget(e.target)) return;

      if (pinchState && e.touches.length < 2) {
        pinchState = null;
        viewport.classList.remove('cherify-mobile-sticky-preview__viewport--pinching');
        const raw = inner.dataset.chPreviewZoomLive;
        delete inner.dataset.chPreviewZoomLive;
        if (raw !== undefined && raw !== '') {
          const z = parseFloat(raw);
          if (Number.isFinite(z)) {
            setZoomLevel(inner, nearestLevelIndex(z), zoomOut, zoomIn);
            syncPreviewCanvasIfVisible();
            schedule();
          }
        }
        lastTouchEnd = 0;
        return;
      }

      if (e.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - lastTouchEnd < DOUBLE_TAP_MS) {
        lastTouchEnd = 0;
        e.preventDefault();
        toggleDoubleZoom();
      } else {
        lastTouchEnd = now;
      }
    }

    viewport.addEventListener('touchend', handleTouchEndPinchOrTap, { passive: false });
    viewport.addEventListener('touchcancel', () => {
      if (!pinchState) return;
      pinchState = null;
      viewport.classList.remove('cherify-mobile-sticky-preview__viewport--pinching');
      delete inner.dataset.chPreviewZoomLive;
      lastTouchEnd = 0;
      syncPreviewCanvasIfVisible();
      schedule();
    });

    closeBtn?.addEventListener('click', () => {
      userDismissed = true;
      el.classList.remove('cherify-mobile-sticky-preview--visible');
      el.setAttribute('aria-hidden', 'true');
    });

    zoomOut.addEventListener('click', () => {
      setZoomLevel(inner, readZoomLevel(inner) - 1, zoomOut, zoomIn);
      syncPreviewCanvasIfVisible();
      schedule();
    });

    zoomIn.addEventListener('click', () => {
      setZoomLevel(inner, readZoomLevel(inner) + 1, zoomOut, zoomIn);
      syncPreviewCanvasIfVisible();
      schedule();
    });

    setZoomLevel(inner, readZoomLevel(inner), zoomOut, zoomIn);

    const section = document.querySelector(SECTION_SEL);
    const mediaQuery = window.matchMedia(MOBILE_MQ);

    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    mediaQuery.addEventListener('change', schedule);

    let mo = null;
    let t = 0;
    if (section && typeof MutationObserver !== 'undefined') {
      const mount =
        section.querySelector('.variant-picker__personalized-mount') ||
        section.querySelector('.cherify-variant-picker-stack');
      if (mount) {
        mo = new MutationObserver(() => {
          window.clearTimeout(t);
          t = window.setTimeout(() => {
            schedule();
            syncPreviewCanvasIfVisible();
          }, 120);
        });
        mo.observe(mount, { childList: true, subtree: true, attributes: true });
      }
    }

    let ro = null;
    if (section && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        schedule();
        syncPreviewCanvasIfVisible();
      });
      for (const sel of ['.variant-picker__personalized-mount', '.cl-canvas-container', '.cherify-variant-picker-stack']) {
        const node = section.querySelector(sel);
        if (node) ro.observe(node);
      }
    }

    run();

    return function destroy() {
      document.removeEventListener('scroll', schedule, { passive: true, capture: true });
      window.removeEventListener('resize', schedule);
      mediaQuery.removeEventListener('change', schedule);
      mo?.disconnect();
      ro?.disconnect();
      if (t) window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }

  const cleanup = init();
  if (cleanup) {
    window.__cherifyMobileStickyPreviewCleanup = cleanup;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const c = init();
      if (c) window.__cherifyMobileStickyPreviewCleanup = c;
    }, { once: true });
  }
})();
