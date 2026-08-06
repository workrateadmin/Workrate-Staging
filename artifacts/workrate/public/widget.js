/**
 * WorkRate Chat Widget Loader  —  v1.0.0
 *
 * Installation:
 *   <script src="https://YOUR-DOMAIN/widget.js" data-business-id="BUSINESS_ID" defer></script>
 *
 * Requirements met:
 *  - Waits for DOM ready before injecting any elements
 *  - Creates its own floating launcher button (no host-page JS needed)
 *  - Opens / closes its own chat panel (CSS transitions, no library)
 *  - Inserts chat iframe dynamically and lazy-loads it on first open
 *  - Starts collapsed — only the launcher is visible on load
 *  - Works at end-of-body and with Wix custom-code embedding
 *  - Works on desktop and mobile (responsive max-width / max-height)
 *  - Never touches scripts written directly on the host page
 *  - All elements use z-index 2147483646 (one below browser max)
 *  - Prevents duplicate instances via window.__workrateWidgetLoaded guard
 *  - Logs a clear console error if the iframe URL or script tag is invalid
 */
(function () {
  'use strict';

  /* ── 1. Duplicate guard ──────────────────────────────────────────────────── */
  if (window.__workrateWidgetLoaded) {
    console.warn('[WorkRate Widget] Already loaded — skipping duplicate.');
    return;
  }
  window.__workrateWidgetLoaded = true;

  /* ── 2. Locate script tag & read attributes ──────────────────────────────── */
  var scriptEl =
    document.currentScript ||
    document.querySelector('script[data-business-id]');

  if (!scriptEl) {
    console.error(
      '[WorkRate Widget] Could not find script tag with data-business-id. ' +
      'Make sure the <script> tag includes a data-business-id attribute.'
    );
    return;
  }

  var businessId = scriptEl.getAttribute('data-business-id');
  if (!businessId || !businessId.trim()) {
    console.error(
      '[WorkRate Widget] data-business-id attribute is empty. ' +
      'Set it to your WorkRate Business ID from Settings → Integrations.'
    );
    return;
  }

  /* ── 3. Derive origin from script src ────────────────────────────────────── */
  var scriptSrc = scriptEl.getAttribute('src') || '';
  var widgetOrigin;
  try {
    widgetOrigin = new URL(scriptSrc, window.location.href).origin;
  } catch (_) {
    console.error(
      '[WorkRate Widget] Could not parse the script src URL: "' + scriptSrc + '". ' +
      'Ensure the src attribute is a valid absolute or root-relative URL.'
    );
    return;
  }

  var IFRAME_URL =
    widgetOrigin +
    '/widget?embedded=1&business_id=' +
    encodeURIComponent(businessId.trim());

  /* ── 4. DOM-ready guard ──────────────────────────────────────────────────── */
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      // Already interactive or complete — schedule on next tick so the calling
      // script can finish executing first (important for Wix inline scripts).
      setTimeout(fn, 0);
    }
  }

  /* ── 5. Build and inject the widget ─────────────────────────────────────── */
  onReady(function () {

    /* ── State ────────────────────────────────────────────────────────────── */
    var open = false;
    var iframeReady = false;

    /* ── Root container (pointer-events:none so it never blocks page) ──────── */
    var root = document.createElement('div');
    root.id = 'workrate-widget-root';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'WorkRate chat widget');
    css(root, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '2147483646',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '12px',
      pointerEvents: 'none',
      // Reset any inherited font/colour that might bleed from host page
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '16px',
      lineHeight: '1',
      boxSizing: 'border-box',
    });

    /* ── Panel wrapper (the white card that animates in/out) ───────────────── */
    var panel = document.createElement('div');
    css(panel, {
      width: '390px',
      height: '600px',
      maxHeight: 'calc(100dvh - 100px)',
      maxWidth: 'calc(100vw - 40px)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)',
      border: '1px solid rgba(255,255,255,0.15)',
      background: '#ffffff',
      // Closed state — invisible and click-through
      opacity: '0',
      transform: 'scale(0.95) translateY(10px)',
      transformOrigin: 'bottom right',
      transition: 'opacity 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1)',
      pointerEvents: 'none',
    });

    /* ── iframe ────────────────────────────────────────────────────────────── */
    var iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'WorkRate Chat');
    iframe.setAttribute('allow', 'camera; microphone');
    // Restrictive sandbox — just enough for the React SPA to run and submit forms
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-popups allow-modals'
    );
    css(iframe, {
      display: 'block',
      width: '100%',
      height: '100%',
      border: 'none',
    });

    iframe.addEventListener('error', function () {
      console.error(
        '[WorkRate Widget] The chat iframe failed to load. ' +
        'Check that "' + IFRAME_URL + '" is reachable and that CORS / CSP headers allow embedding.'
      );
    });

    panel.appendChild(iframe);

    /* ── Launcher button ───────────────────────────────────────────────────── */
    var btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.setAttribute('aria-label', 'Open WorkRate chat');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'workrate-chat-panel');
    panel.id = 'workrate-chat-panel';
    css(btn, {
      position: 'relative',
      width: '56px',
      height: '56px',
      borderRadius: '50%',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#2563EB',
      boxShadow: '0 8px 30px rgba(37,99,235,0.45)',
      transition: 'transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
      pointerEvents: 'auto',
      flexShrink: '0',
      outline: 'none',
      padding: '0',
      margin: '0',
      // Prevent Wix host-page button styles from applying
      appearance: 'none',
      WebkitAppearance: 'none',
      textDecoration: 'none',
      verticalAlign: 'middle',
    });

    /* ── Icon: chat bubble (shown when closed) ─────────────────────────────── */
    var iconChat = svgEl(
      'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'
    );
    css(iconChat, {
      position: 'absolute',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: '1',
      transform: 'scale(1)',
    });

    /* ── Icon: X (shown when open) ─────────────────────────────────────────── */
    var iconClose = crossSvgEl();
    css(iconClose, {
      position: 'absolute',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      opacity: '0',
      transform: 'scale(0.75)',
    });

    /* ── Unread notification dot ───────────────────────────────────────────── */
    var dot = document.createElement('span');
    css(dot, {
      position: 'absolute',
      top: '-2px',
      right: '-2px',
      width: '14px',
      height: '14px',
      background: '#EF4444',
      borderRadius: '50%',
      border: '2.5px solid #ffffff',
      display: 'none',
      pointerEvents: 'none',
    });

    btn.appendChild(iconChat);
    btn.appendChild(iconClose);
    btn.appendChild(dot);

    /* ── Hover / press states (no CSS class, fully inline) ─────────────────── */
    btn.addEventListener('mouseenter', function () {
      if (!open) btn.style.transform = 'scale(1.1)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('mousedown', function () {
      btn.style.transform = 'scale(0.95)';
    });
    btn.addEventListener('mouseup', function () {
      btn.style.transform = open ? 'scale(1)' : 'scale(1.1)';
    });

    /* ── Open / close logic ────────────────────────────────────────────────── */
    function setOpen(nextOpen) {
      open = nextOpen;

      if (open) {
        // Lazy-load the iframe on first open
        if (!iframeReady) {
          iframe.src = IFRAME_URL;
          iframeReady = true;
        }
        css(panel, {
          opacity: '1',
          transform: 'scale(1) translateY(0)',
          pointerEvents: 'auto',
        });
        css(btn, {
          background: '#1E293B',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        });
        css(iconChat, { opacity: '0', transform: 'scale(0.75)' });
        css(iconClose, { opacity: '1', transform: 'scale(1)' });
        btn.setAttribute('aria-label', 'Close WorkRate chat');
        btn.setAttribute('aria-expanded', 'true');
        dot.style.display = 'none';
      } else {
        css(panel, {
          opacity: '0',
          transform: 'scale(0.95) translateY(10px)',
          pointerEvents: 'none',
        });
        css(btn, {
          background: '#2563EB',
          boxShadow: '0 8px 30px rgba(37,99,235,0.45)',
        });
        css(iconChat, { opacity: '1', transform: 'scale(1)' });
        css(iconClose, { opacity: '0', transform: 'scale(0.75)' });
        btn.setAttribute('aria-label', 'Open WorkRate chat');
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    btn.addEventListener('click', function () {
      setOpen(!open);
    });

    /* ── postMessage bridge ────────────────────────────────────────────────── */
    window.addEventListener('message', function (ev) {
      // Strict origin check — only trust messages from our own widget domain
      if (ev.origin !== widgetOrigin) return;
      var data = ev.data;
      if (!data || typeof data !== 'object') return;

      switch (data.type) {
        case 'workrate:close':
          setOpen(false);
          break;
        case 'workrate:unread':
          if (!open) dot.style.display = 'block';
          break;
        case 'workrate:resize':
          // Future: dynamic height adjustment
          if (data.height && typeof data.height === 'number') {
            var h = Math.min(Math.max(data.height, 200), 760);
            panel.style.height = h + 'px';
          }
          break;
      }
    });

    /* ── Keyboard: Escape closes the panel ──────────────────────────────────── */
    document.addEventListener('keydown', function (ev) {
      if (open && (ev.key === 'Escape' || ev.keyCode === 27)) {
        setOpen(false);
        btn.focus();
      }
    });

    /* ── Assemble and mount ─────────────────────────────────────────────────── */
    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);

    /* ── Expose minimal public API on window (optional) ───────────────────── */
    window.WorkRateWidget = {
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      toggle: function () { setOpen(!open); },
    };
  });

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  /** Apply an object of camelCase styles to an element. */
  function css(el, styles) {
    Object.keys(styles).forEach(function (k) {
      el.style[k] = styles[k];
    });
  }

  /** Create a 24×24 SVG icon with a single <path> (stroke, no fill). */
  function svgEl(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'white');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  /** Create the × (close) SVG using two <line> elements. */
  function crossSvgEl() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'white');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    function line(x1, y1, x2, y2) {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      svg.appendChild(l);
    }
    line(18, 6, 6, 18);
    line(6, 6, 18, 18);
    return svg;
  }

})();
