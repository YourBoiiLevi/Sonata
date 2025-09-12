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
    ALLOW_DATA_ATTR: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['style'],
    // Preserve common SVG and Shiki attributes
    ADD_ATTR: [
      'xmlns','xmlns:xlink','xml:space','preserveAspectRatio','xlink:href','clip-path','clipPathUnits','mask','maskUnits','marker-start','marker-mid','marker-end','markerWidth','markerHeight','refX','refY','patternUnits','patternContentUnits','filterUnits','in','in2','result','stdDeviation','points','offset','stop-color','stop-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset','stroke-opacity','fill-opacity'
    ],
    ALLOWED_ATTR: [
      'class','style','id','title','href','src','alt','rel','target','aria-*','width','height','viewBox','fill','stroke','d','x','y','rx','ry','cx','cy','r','transform','role','tabindex'
    ]
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  const linkPrefixes = window.SONATA_ALLOWED_LINK_PREFIXES;
  const imgPrefixes = window.SONATA_ALLOWED_IMAGE_PREFIXES;
  if (linkPrefixes) {
    template.content.querySelectorAll('a[href]').forEach(a => { a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('target', '_blank'); });
    filterByPrefixes(template.content, 'a[href]', 'href', linkPrefixes);
  }
  if (imgPrefixes) filterByPrefixes(template.content, 'img[src]', 'src', imgPrefixes);
  return template.innerHTML;
}
