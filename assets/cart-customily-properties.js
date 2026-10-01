/**
 * Cart Customily Properties Handler
 *
 * Adds "_" prefix to custom properties that don't have it.
 * Properties with "_" prefix are automatically hidden by Shopify.
 */

import { fetchConfig } from '@theme/utilities';

const CUSTOMILY_PROPERTY_CACHE_KEY = '_customily_properties_stripped';

async function stripCustomilyProperties() {
  // Skip if already processed in this session
  if (sessionStorage.getItem(CUSTOMILY_PROPERTY_CACHE_KEY)) {
    return;
  }

  // Only run on cart page or drawer
  if (!window.location.pathname.includes('/cart') && !document.querySelector('cart-drawer, cart-items-component')) {
    return;
  }

  try {
    const response = await fetch('/cart.js', {
      credentials: 'include',
    });

    if (!response.ok) {
      return;
    }

    const cart = await response.json();

    if (!cart.items || cart.items.length === 0) {
      return;
    }

    // Check if any items have properties that need prefixing
    let hasPropertiesToStrip = false;
    const updates = [];

    for (const item of cart.items) {
      if (!item.properties || Object.keys(item.properties).length === 0) {
        continue;
      }

      const newProperties = {};
      let hasChanges = false;

      for (const [key, value] of Object.entries(item.properties)) {
        // If property starts with "_", keep as-is
        // If property doesn't start with "_", add "_" prefix to hide it
        if (key.startsWith('_')) {
          newProperties[key] = value;
        } else {
          newProperties[`_${key}`] = value;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        hasPropertiesToStrip = true;
        updates.push({
          id: item.key,
          properties: newProperties,
        });
      }
    }

    // Only update if there are properties to strip
    if (!hasPropertiesToStrip) {
      sessionStorage.setItem(CUSTOMILY_PROPERTY_CACHE_KEY, 'true');
      return;
    }

    // Update each line item with prefixed properties
    for (const update of updates) {
      const body = JSON.stringify({
        id: update.id,
        properties: update.properties,
      });

      await fetch(`${Theme.routes.cart_change_url}`, fetchConfig('json', { body }));
    }

    // Mark as processed
    sessionStorage.setItem(CUSTOMILY_PROPERTY_CACHE_KEY, 'true');

    // Reload the page to show updated cart
    window.location.reload();
  } catch (error) {
    console.error('Error stripping customily properties:', error);
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', stripCustomilyProperties);
} else {
  stripCustomilyProperties();
}
