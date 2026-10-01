/**
 * PDP estimated delivery with country-specific and product-specific shipping config.
 * Based on Almagems shipping logic.
 * Idempotent if script is included more than once.
 */
(function () {
  if (window.__pdpEstimatedDeliveryBound) return;
  window.__pdpEstimatedDeliveryBound = true;

  /* ========== SHIPPING CONFIG (from Almagems) ========== */
  const SHIPPING_CONFIG = {
    US: {
      default: [
        { prepareMin: 2, prepareMax: 5, shippingMin: 6, shippingMax: 10, label: "Standard Shipping" },
      ],
      MG: [
        { prepareMin: 2, prepareMax: 4, shippingMin: 3, shippingMax: 7, label: "Standard Shipping" }
      ],
      AMUG: [
        { prepareMin: 2, prepareMax: 4, shippingMin: 3, shippingMax: 7, label: "Standard Shipping" }
      ],
      WBAS: [
        { prepareMin: 2, prepareMax: 4, shippingMin: 3, shippingMax: 7, label: "Standard Shipping" }
      ],
      BBAS: [
        { prepareMin: 2, prepareMax: 4, shippingMin: 3, shippingMax: 7, label: "Standard Shipping" }
      ],
      WYOU: [
        { prepareMin: 2, prepareMax: 4, shippingMin: 3, shippingMax: 7, label: "Standard Shipping" }
      ]
    },
    OTHER: [
      { prepareMin: 2, prepareMax: 5, shippingMin: 6, shippingMax: 12, label: "Standard Shipping" }
    ]
  };

  /* ========== COUNTRY LIST (from Almagems) ========== */
  const COUNTRY_LIST = [
    { code: "US", name: "United States" },
    { code: "GB", name: "United Kingdom" },
    { code: "AU", name: "Australia" },
    { code: "CA", name: "Canada" },
    { code: "AD", name: "Andorra" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "AF", name: "Afghanistan" },
    { code: "AG", name: "Antigua Barbuda" },
    { code: "AI", name: "Anguilla" },
    { code: "AL", name: "Albania" },
    { code: "AM", name: "Armenia" },
    { code: "AO", name: "Angola" },
    { code: "AR", name: "Argentina" },
    { code: "AT", name: "Austria" },
    { code: "AW", name: "Aruba" },
    { code: "AX", name: "Åland Islands" },
    { code: "AZ", name: "Azerbaijan" },
    { code: "BA", name: "Bosnia & Herzegovina" },
    { code: "BB", name: "Barbados" },
    { code: "BD", name: "Bangladesh" },
    { code: "BE", name: "Belgium" },
    { code: "BF", name: "Burkina Faso" },
    { code: "BG", name: "Bulgaria" },
    { code: "BH", name: "Bahrain" },
    { code: "BI", name: "Burundi" },
    { code: "BJ", name: "Benin" },
    { code: "BL", name: "St. Barthélemy" },
    { code: "BM", name: "Bermuda" },
    { code: "BN", name: "Brunei" },
    { code: "BO", name: "Bolivia" },
    { code: "BQ", name: "Caribbean Netherlands" },
    { code: "BR", name: "Brazil" },
    { code: "BS", name: "Bahamas" },
    { code: "BT", name: "Bhutan" },
    { code: "BW", name: "Botswana" },
    { code: "BY", name: "Belarus" },
    { code: "BZ", name: "Belize" },
    { code: "CC", name: "Cocos (Keeling) Islands" },
    { code: "CD", name: "Congo - Kinshasa" },
    { code: "CF", name: "Central African Republic" },
    { code: "CG", name: "Congo - Brazzaville" },
    { code: "CH", name: "Switzerland" },
    { code: "CI", name: "Côte d'Ivoire" },
    { code: "CK", name: "Cook Islands" },
    { code: "CL", name: "Chile" },
    { code: "CM", name: "Cameroon" },
    { code: "CN", name: "China" },
    { code: "CO", name: "Colombia" },
    { code: "CR", name: "Costa Rica" },
    { code: "CV", name: "Cape Verde" },
    { code: "CW", name: "Curaçao" },
    { code: "CX", name: "Christmas Island" },
    { code: "CY", name: "Cyprus" },
    { code: "CZ", name: "Czechia" },
    { code: "DE", name: "Germany" },
    { code: "DJ", name: "Djibouti" },
    { code: "DK", name: "Denmark" },
    { code: "DM", name: "Dominica" },
    { code: "DO", name: "Dominican Republic" },
    { code: "DZ", name: "Algeria" },
    { code: "EC", name: "Ecuador" },
    { code: "EE", name: "Estonia" },
    { code: "EG", name: "Egypt" },
    { code: "EH", name: "Western Sahara" },
    { code: "ER", name: "Eritrea" },
    { code: "ES", name: "Spain" },
    { code: "ET", name: "Ethiopia" },
    { code: "FI", name: "Finland" },
    { code: "FJ", name: "Fiji" },
    { code: "FK", name: "Falkland Islands" },
    { code: "FO", name: "Faroe Islands" },
    { code: "FR", name: "France" },
    { code: "GA", name: "Gabon" },
    { code: "GD", name: "Grenada" },
    { code: "GE", name: "Georgia" },
    { code: "GF", name: "French Guiana" },
    { code: "GG", name: "Guernsey" },
    { code: "GH", name: "Ghana" },
    { code: "GI", name: "Gibraltar" },
    { code: "GL", name: "Greenland" },
    { code: "GM", name: "Gambia" },
    { code: "GN", name: "Guinea" },
    { code: "GP", name: "Guadeloupe" },
    { code: "GQ", name: "Equatorial Guinea" },
    { code: "GR", name: "Greece" },
    { code: "GS", name: "South Georgia & South Sandwich Islands" },
    { code: "GT", name: "Guatemala" },
    { code: "GW", name: "Guinea-Bissau" },
    { code: "GY", name: "Guyana" },
    { code: "HK", name: "Hong Kong SAR" },
    { code: "HN", name: "Honduras" },
    { code: "HR", name: "Croatia" },
    { code: "HT", name: "Haiti" },
    { code: "HU", name: "Hungary" },
    { code: "ID", name: "Indonesia" },
    { code: "IE", name: "Ireland" },
    { code: "IL", name: "Israel" },
    { code: "IM", name: "Isle of Man" },
    { code: "IN", name: "India" },
    { code: "IO", name: "British Indian Ocean Territory" },
    { code: "IQ", name: "Iraq" },
    { code: "IS", name: "Iceland" },
    { code: "IT", name: "Italy" },
    { code: "JE", name: "Jersey" },
    { code: "JM", name: "Jamaica" },
    { code: "JO", name: "Jordan" },
    { code: "JP", name: "Japan" },
    { code: "KE", name: "Kenya" },
    { code: "KG", name: "Kyrgyzstan" },
    { code: "KH", name: "Cambodia" },
    { code: "KI", name: "Kiribati" },
    { code: "KM", name: "Comoros" },
    { code: "KN", name: "St. Kitts & Nevis" },
    { code: "KR", name: "South Korea" },
    { code: "KW", name: "Kuwait" },
    { code: "KY", name: "Cayman Islands" },
    { code: "KZ", name: "Kazakhstan" },
    { code: "LA", name: "Laos" },
    { code: "LB", name: "Lebanon" },
    { code: "LC", name: "St. Lucia" },
    { code: "LI", name: "Liechtenstein" },
    { code: "LK", name: "Sri Lanka" },
    { code: "LR", name: "Liberia" },
    { code: "LS", name: "Lesotho" },
    { code: "LT", name: "Lithuania" },
    { code: "LU", name: "Luxembourg" },
    { code: "LV", name: "Latvia" },
    { code: "LY", name: "Libya" },
    { code: "MA", name: "Morocco" },
    { code: "MC", name: "Monaco" },
    { code: "MD", name: "Moldova" },
    { code: "ME", name: "Montenegro" },
    { code: "MF", name: "St. Martin" },
    { code: "MG", name: "Madagascar" },
    { code: "MK", name: "North Macedonia" },
    { code: "ML", name: "Mali" },
    { code: "MM", name: "Myanmar (Burma)" },
    { code: "MN", name: "Mongolia" },
    { code: "MO", name: "Macao SAR" },
    { code: "MQ", name: "Martinique" },
    { code: "MR", name: "Mauritania" },
    { code: "MS", name: "Montserrat" },
    { code: "MT", name: "Malta" },
    { code: "MU", name: "Mauritius" },
    { code: "MV", name: "Maldives" },
    { code: "MW", name: "Malawi" },
    { code: "MX", name: "Mexico" },
    { code: "MY", name: "Malaysia" },
    { code: "MZ", name: "Mozambique" },
    { code: "NA", name: "Namibia" },
    { code: "NC", name: "New Caledonia" },
    { code: "NE", name: "Niger" },
    { code: "NF", name: "Norfolk Island" },
    { code: "NG", name: "Nigeria" },
    { code: "NI", name: "Nicaragua" },
    { code: "NL", name: "Netherlands" },
    { code: "NO", name: "Norway" },
    { code: "NP", name: "Nepal" },
    { code: "NR", name: "Nauru" },
    { code: "NU", name: "Niue" },
    { code: "NZ", name: "New Zealand" },
    { code: "OM", name: "Oman" },
    { code: "PA", name: "Panama" },
    { code: "PE", name: "Peru" },
    { code: "PF", name: "French Polynesia" },
    { code: "PG", name: "Papua New Guinea" },
    { code: "PH", name: "Philippines" },
    { code: "PK", name: "Pakistan" },
    { code: "PL", name: "Poland" },
    { code: "PM", name: "St. Pierre & Miquelon" },
    { code: "PN", name: "Pitcairn Islands" },
    { code: "PS", name: "Palestinian Territories" },
    { code: "PT", name: "Portugal" },
    { code: "PY", name: "Paraguay" },
    { code: "QA", name: "Qatar" },
    { code: "RE", name: "Réunion" },
    { code: "RO", name: "Romania" },
    { code: "RS", name: "Serbia" },
    { code: "RU", name: "Russia" },
    { code: "RW", name: "Rwanda" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "SB", name: "Solomon Islands" },
    { code: "SC", name: "Seychelles" },
    { code: "SD", name: "Sudan" },
    { code: "SE", name: "Sweden" },
    { code: "SG", name: "Singapore" },
    { code: "SH", name: "St. Helena" },
    { code: "SI", name: "Slovenia" },
    { code: "SJ", name: "Svalbard & Jan Mayen" },
    { code: "SK", name: "Slovakia" },
    { code: "SL", name: "Sierra Leone" },
    { code: "SM", name: "San Marino" },
    { code: "SN", name: "Senegal" },
    { code: "SO", name: "Somalia" },
    { code: "SR", name: "Suriname" },
    { code: "SS", name: "South Sudan" },
    { code: "ST", name: "São Tomé & Príncipe" },
    { code: "SV", name: "El Salvador" },
    { code: "SX", name: "Sint Maarten" },
    { code: "SZ", name: "Eswatini" },
    { code: "TA", name: "Tristan da Cunha" },
    { code: "TC", name: "Turks & Caicos Islands" },
    { code: "TD", name: "Chad" },
    { code: "TF", name: "French Southern Territories" },
    { code: "TG", name: "Togo" },
    { code: "TH", name: "Thailand" },
    { code: "TJ", name: "Tajikistan" },
    { code: "TK", name: "Tokelau" },
    { code: "TL", name: "Timor-Leste" },
    { code: "TM", name: "Turkmenistan" },
    { code: "TN", name: "Tunisia" },
    { code: "TO", name: "Tonga" },
    { code: "TR", name: "Türkiye" },
    { code: "TT", name: "Trinidad & Tobago" },
    { code: "TV", name: "Tuvalu" },
    { code: "TW", name: "Taiwan" },
    { code: "TZ", name: "Tanzania" },
    { code: "UA", name: "Ukraine" },
    { code: "UG", name: "Uganda" },
    { code: "UM", name: "U.S. Outlying Islands" },
    { code: "UY", name: "Uruguay" },
    { code: "UZ", name: "Uzbekistan" },
    { code: "VA", name: "Vatican City" },
    { code: "VC", name: "St. Vincent & Grenadines" },
    { code: "VE", name: "Venezuela" },
    { code: "VG", name: "British Virgin Islands" },
    { code: "VN", name: "Vietnam" },
    { code: "VU", name: "Vanuatu" },
    { code: "WF", name: "Wallis & Futuna" },
    { code: "WS", name: "Samoa" },
    { code: "XK", name: "Kosovo" },
    { code: "YE", name: "Yemen" },
    { code: "YT", name: "Mayotte" },
    { code: "ZA", name: "South Africa" },
    { code: "ZM", name: "Zambia" },
    { code: "ZW", name: "Zimbabwe" }
  ];

  /* ========== HELPER FUNCTIONS (from Almagems) ========== */

  function findCountry(code) {
    return COUNTRY_LIST.find(function(c) { return c.code === code; });
  }

  function formatMonthDay(date) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[date.getMonth()] + " " + date.getDate();
  }

  function getRegionForCountry(countryCode) {
    if (!countryCode) return "OTHER";
    var code = countryCode.toUpperCase();
    var regionKeys = Object.keys(SHIPPING_CONFIG).filter(function(k) { return k !== "OTHER"; });
    if (regionKeys.indexOf(code) !== -1) return code;
    return "OTHER";
  }

  function getConfigList(countryCode, productKey) {
    var region = getRegionForCountry(countryCode);
    if (region === "OTHER") return SHIPPING_CONFIG.OTHER;
    var regionCfg = SHIPPING_CONFIG[region] || {};
    var normalizedKey = (productKey || "").toUpperCase();
    if (normalizedKey && regionCfg[normalizedKey]) {
      return regionCfg[normalizedKey];
    }
    if (regionCfg.default) {
      return regionCfg.default;
    }
    return SHIPPING_CONFIG.OTHER;
  }

  function buildDeliveryInfos(countryCode, productKey) {
    var configs = getConfigList(countryCode, productKey);
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    return configs.map(function(cfg) {
      var orderDate = new Date(today);

      var shipStart = new Date(today);
      shipStart.setDate(shipStart.getDate() + cfg.prepareMin);
      var shipEnd = new Date(today);
      shipEnd.setDate(shipEnd.getDate() + cfg.prepareMax);

      var deliverStart = new Date(today);
      deliverStart.setDate(deliverStart.getDate() + cfg.prepareMin + cfg.shippingMin);
      var deliverEnd = new Date(today);
      deliverEnd.setDate(deliverEnd.getDate() + cfg.prepareMax + cfg.shippingMax);

      var shipRange = formatMonthDay(shipStart) + " – " + formatMonthDay(shipEnd);
      var deliverRange = formatMonthDay(deliverStart) + " – " + formatMonthDay(deliverEnd);

      return {
        label: cfg.label,
        orderDate: formatMonthDay(orderDate),
        shipRange: shipRange,
        deliverRange: deliverRange
      };
    });
  }

  /* ========== ORIGINAL ETA FUNCTIONS ========== */

  function addDaysFromToday(daysFromToday) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + daysFromToday);
    return d;
  }

  function skipToMondayIfWeekend(date) {
    var x = new Date(date.getTime());
    var day = x.getDay();
    if (day === 6) x.setDate(x.getDate() + 2);
    else if (day === 0) x.setDate(x.getDate() + 1);
    return x;
  }

  function formatDateRangeLong(from, to) {
    var locale = document.documentElement.lang || 'en';
    var sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    if (sameMonth) {
      var month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(from);
      return month + " " + from.getDate() + " – " + to.getDate();
    }
    var long = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' });
    return long.format(from) + " – " + long.format(to);
  }

  /* ========== MAIN FILL FUNCTION ========== */

  var SELECTORS = {
    orderPlaced: '[data-pdp-order-placed], [data-pdp-modal-order-placed]',
    orderShips: '[data-pdp-order-ships], [data-pdp-modal-order-ships]',
    orderDelivered: '[data-pdp-order-delivered], [data-pdp-modal-order-delivered]',
    trigger: '[data-pdp-eta-open]',
    closeBtn: '[data-pdp-eta-close]',
    modal: '[data-pdp-eta-modal]',
  };

  function fill(el) {
    if (el.getAttribute('data-pdp-estimated-delivery-ready') === 'true') return;

    var rangeEl = el.querySelector('.pdp-estimated-delivery__range');
    if (!rangeEl) return;

    // Get country code and product key from data attributes
    var countryCode = el.dataset.countryCode || 'US';
    var productKey = el.dataset.productKey || '';

    // Build delivery info using Almagems logic
    var infos = buildDeliveryInfos(countryCode, productKey);
    var info = infos[0]; // Use first shipping option for main display

    if (!info) {
      // Fallback to original behavior if no config found
      var a = parseInt(el.dataset.minDays || '10', 10);
      var b = parseInt(el.dataset.maxDays || '14', 10);
      var minDays = Math.min(a, b);
      var maxDays = Math.max(a, b);
      var from = skipToMondayIfWeekend(addDaysFromToday(minDays));
      var to = skipToMondayIfWeekend(addDaysFromToday(maxDays));
      rangeEl.textContent = formatDateRangeLong(from, to);
    } else {
      // Use Almagems delivery range
      rangeEl.textContent = info.deliverRange;
    }

    // Update timeline dates
    var short = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
      month: 'short',
      day: 'numeric',
    });

    if (info) {
      el.querySelectorAll(SELECTORS.orderPlaced).forEach(function(node) {
        node.textContent = info.orderDate;
      });
      el.querySelectorAll(SELECTORS.orderShips).forEach(function(node) {
        node.textContent = info.shipRange;
      });
      el.querySelectorAll(SELECTORS.orderDelivered).forEach(function(node) {
        node.textContent = info.deliverRange;
      });
    } else {
      // Fallback dates
      var orderDate = addDaysFromToday(0);
      var shipFrom = skipToMondayIfWeekend(addDaysFromToday(Math.max(2 - 4, 1)));
      var shipTo = skipToMondayIfWeekend(addDaysFromToday(Math.max(2 - 2, 1)));
      var from = skipToMondayIfWeekend(addDaysFromToday(10));
      var to = skipToMondayIfWeekend(addDaysFromToday(14));

      el.querySelectorAll(SELECTORS.orderPlaced).forEach(function(node) {
        node.textContent = short.format(orderDate);
      });
      el.querySelectorAll(SELECTORS.orderShips).forEach(function(node) {
        node.textContent = short.format(shipFrom) + " - " + short.format(shipTo);
      });
      el.querySelectorAll(SELECTORS.orderDelivered).forEach(function(node) {
        node.textContent = formatDateRangeLong(from, to);
      });
    }

    // Modal handling (updated to use DialogComponent if available)
    var trigger = el.querySelector(SELECTORS.trigger);
    var closeBtn = el.querySelector(SELECTORS.closeBtn);
    var modal = el.querySelector(SELECTORS.modal);
    var dialogComponent = modal ? modal.closest('dialog-component') : null;
    var bp = parseInt(el.dataset.mobileBreakpoint || '749', 10);
    var mobileMedia = window.matchMedia('(max-width: ' + bp + 'px)');

    if (trigger && modal && (typeof modal.showModal === 'function' || dialogComponent)) {
      var openHandler = function(event) {
        if (!mobileMedia.matches) return;
        if (event && event.type === 'click') {
          event.preventDefault();
        }
        if (dialogComponent && typeof dialogComponent.showDialog === 'function') {
          dialogComponent.showDialog();
        } else {
          modal.showModal();
        }
      };
      trigger.addEventListener('click', openHandler);
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', function() {
        if (dialogComponent && typeof dialogComponent.closeDialog === 'function') {
          dialogComponent.closeDialog();
        } else {
          modal.close();
        }
      });
    }

    if (modal && !dialogComponent) {
      // Only keep legacy click-outside logic if not using dialog-component (which handles it)
      modal.addEventListener('click', function(event) {
        var rect = modal.getBoundingClientRect();
        var isOutside = event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (isOutside) modal.close();
      });
    }

    el.setAttribute('data-pdp-estimated-delivery-ready', 'true');
  }

  function run() {
    document.querySelectorAll('[data-pdp-estimated-delivery]').forEach(fill);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  /* ========== LISTEN FOR COUNTRY CHANGES ========== */
  document.addEventListener('shipping:country-changed', function(event) {
    var countryCode = event.detail && event.detail.countryCode;
    if (!countryCode) return;

    document.querySelectorAll('[data-pdp-estimated-delivery]').forEach(function(el) {
      el.setAttribute('data-country-code', countryCode);
      el.setAttribute('data-pdp-estimated-delivery-ready', 'false');
    });
    run();
  });
})();
