// dom-sanitize.js
// Lightweight wrapper around DOMPurify that works in the browser without a bundler.
// Dynamically imports DOMPurify ESM from a CDN and exposes sanitize helpers.

let dompurifyPromise = null;

async function getDOMPurify() {
  if (!dompurifyPromise) {
    // Prefer jsDelivr; fall back to unpkg if needed
    dompurifyPromise = import(
      'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.es.mjs'
    ).catch(() => import('https://unpkg.com/dompurify@3.0.8/dist/purify.es.mjs'));
  }
  const mod = await dompurifyPromise;
  return mod.default || mod;
}

export async function sanitize(html) {
  const DOMPurify = await getDOMPurify();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Keep IDs and data-* attributes for internal usage
    ALLOWED_ATTR: [
      'id', 'class', 'style', 'title',
      // Global ARIA attrs
      'role', 'aria-label', 'aria-describedby', 'aria-labelledby',
      // Links
      'href', 'target', 'rel', 'download',
      // Images
      'src', 'alt', 'width', 'height', 'loading', 'decoding',
      // Data attributes
      ...Array.from({ length: 200 }, (_, i) => `data-${i}`), // noop; DOMPurify already allows data-*
    ],
    // Allow data-* by default
    ALLOW_DATA_ATTR: true,
  });
}

// Sanitize an Element's innerHTML in place
export async function sanitizeInto(element, html) {
  element.innerHTML = await sanitize(html);
}

// Sanitize attributes on an already-created node (simple passthrough for now)
export async function sanitizeNodeAttributes(node) {
  // Intentionally minimal: rely on DOMPurify.sanitize during HTML insertion
  return node;
}
