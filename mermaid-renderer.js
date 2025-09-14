// mermaid-renderer.js
// Lazy-load Mermaid and render with last-valid-SVG fallback during streaming.

let mermaidModPromise = null;
let initialized = false; // kept for backward compatibility, but we will reinitialize each call

async function getMermaid() {
  if (!mermaidModPromise) {
    mermaidModPromise = import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs')
      .catch(() => import('https://unpkg.com/mermaid@10.9.1/dist/mermaid.esm.min.mjs'));
  }
  const mod = await mermaidModPromise;
  const mermaid = mod.default || mod;
  // Always (re)initialize to apply latest settings.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: (window.SONATA_MERMAID_SECURITY || 'strict'),
    fontFamily: 'monospace',
    suppressErrorRendering: true,
    theme: window.SONATA_MERMAID_THEME || 'neutral',
  });
  initialized = true;
  return mermaid;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export async function renderMermaid(container, chart, state) {
  container.classList.add('mermaid-container');
  const spinnerSelector = '.mermaid-spinner';

  // Spinner only before the first success
  if (!state.firstLoaded && !state.lastValidSvg) {
    if (!container.querySelector(spinnerSelector)) {
      const sp = document.createElement('div');
      sp.className = 'mermaid-spinner';
      sp.innerHTML = '<div class="spin"></div><span>Rendering diagram…</span>';
      container.innerHTML = '';
      container.appendChild(sp);
    }
  }

  try {
    const mermaid = await getMermaid();
    const uniqueId = `mermaid-${hash(chart)}-${Math.random().toString(36).slice(2, 8)}`;
    const { svg } = await mermaid.render(uniqueId, chart);
    container.innerHTML = svg;
    state.lastValidSvg = svg;
    state.firstLoaded = true;
  } catch (err) {
    // Keep last valid SVG if available
    if (state.lastValidSvg) {
      if (!container.innerHTML) container.innerHTML = state.lastValidSvg;
      return;
    }
    // No valid SVG yet: show minimal error box
    const details = document.createElement('div');
    details.className = 'mermaid-error';
    const summary = document.createElement('div');
    summary.textContent = 'Mermaid parse error (show details)';
    summary.className = 'summary';
    const pre = document.createElement('pre');
    pre.textContent = chart;
    details.appendChild(summary);
    details.appendChild(pre);
    container.innerHTML = '';
    container.appendChild(details);
  }
}
