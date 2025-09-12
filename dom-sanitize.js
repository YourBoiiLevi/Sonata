// Streamdown-style DOM sanitization wrapper for Sonata
// - Lazy-loads DOMPurify ESM for browsers
// - Allows safe SVG and Math markup
// - Optional link/image allowlists via window.SONATA_ALLOWED_LINK_PREFIXES / SONATA_ALLOWED_IMAGE_PREFIXES

let purifyInstancePromise = null;

async function getDOMPurify() {
  if (purifyInstancePromise) return purifyInstancePromise;
  purifyInstancePromise = (async () => {
    // Prefer global if already present
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') return window.DOMPurify;
    // Load ESM build
    const mod = await import('https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.es.mjs');
    const createDOMPurify = mod.default || mod;
    return createDOMPurify(window);
  })();
  return purifyInstancePromise;
}

function filterByPrefixes(root, selector, attr, prefixes) {
  if (!Array.isArray(prefixes) || prefixes.length === 0) return;
  const nodes = root.querySelectorAll(selector);
  for (const el of nodes) {
    const val = el.getAttribute(attr) || '';
    if (!prefixes.some(p => val.startsWith(p))) {
      // Remove unsafe nodes that don't match the allowlist
      el.remove();
    }
  }
}

export async function sanitizeHTML(html) {
  const DOMPurify = await getDOMPurify();
  const clean = DOMPurify.sanitize(html, {
    ALLOW_ARIA: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // Preserve styles used by Shiki while still sanitizing CSS
    ALLOWED_ATTR: [
      'class','style','id','title','href','src','alt','rel','target','aria-*','data-*','width','height','viewBox','fill','stroke','d','x','y','rx','ry','cx','cy','r','transform','role','tabindex'
    ]
  });
  // Optional allowlists
  const template = document.createElement('template');
  template.innerHTML = clean;
  const linkPrefixes = window.SONATA_ALLOWED_LINK_PREFIXES;
  const imgPrefixes = window.SONATA_ALLOWED_IMAGE_PREFIXES;
  if (linkPrefixes) {
    // Force safe link behavior
    template.content.querySelectorAll('a[href]').forEach(a => { a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('target', '_blank'); });
    filterByPrefixes(template.content, 'a[href]', 'href', linkPrefixes);
  }
  if (imgPrefixes) filterByPrefixes(template.content, 'img[src]', 'src', imgPrefixes);
  return template.innerHTML;
}
