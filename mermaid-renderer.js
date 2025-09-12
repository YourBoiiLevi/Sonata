// Mermaid renderer for streaming diagrams with last-valid fallback (Streamdown-style)
// - Lazy-initializes Mermaid ESM
// - Keeps last valid SVG per container; shows spinner before first success
// - Suppresses built-in error rendering to avoid flicker during streaming

import { sanitizeHTML } from './dom-sanitize.js';

let mermaidModPromise = null;
const lastValidMap = new WeakMap(); // container -> { svg: string, hasSuccess: boolean }

async function getMermaid() {
  if (mermaidModPromise) return mermaidModPromise;
  mermaidModPromise = (async () => {
    const mermaid = (await import('https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'default' });
    return mermaid;
  })();
  return mermaidModPromise;
}

function ensureBaseStructure(container) {
  let header = container.querySelector('[data-diagram-header]');
  let body = container.querySelector('[data-diagram-body]');
  if (!header) {
    header = document.createElement('div'); header.setAttribute('data-diagram-header', '');
    const label = document.createElement('span'); label.setAttribute('data-diagram-label', '');
    const copy = document.createElement('button'); copy.type='button'; copy.setAttribute('data-diagram-copy', ''); copy.textContent='Copy';
    header.appendChild(label); header.appendChild(copy); container.appendChild(header);
  }
  if (!body) {
    body = document.createElement('div'); body.setAttribute('data-diagram-body', '');
    const spinner = document.createElement('div'); spinner.setAttribute('data-diagram-spinner', ''); spinner.textContent = 'Rendering…';
    const svgWrap = document.createElement('div'); svgWrap.setAttribute('data-diagram-svg', '');
    body.appendChild(spinner); body.appendChild(svgWrap); container.appendChild(body);
  }
  return { header, body };
}

export async function renderMermaid(chart, container, opts = {}) {
  const mermaid = await getMermaid();
  container.setAttribute('data-diagram-container', '');
  const { header, body } = ensureBaseStructure(container);
  const labelEl = header.querySelector('[data-diagram-label]'); labelEl.textContent = 'MERMAID';
  const copyBtn = header.querySelector('[data-diagram-copy]');
  const spinner = body.querySelector('[data-diagram-spinner]');
  const svgWrap = body.querySelector('[data-diagram-svg]');

  const fenced = '```mermaid\n' + chart + '\n```';
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(fenced); copyBtn.textContent='Copied'; setTimeout(()=>copyBtn.textContent='Copy', 1200); } catch {}
  };

  let state = lastValidMap.get(svgWrap) || { svg: '', hasSuccess: false };
  // Keep spinner visible until first success
  spinner.style.display = state.hasSuccess ? 'none' : 'block';

  const uniqueId = opts.uniqueId || ('mermaid-' + Math.random().toString(36).slice(2));
  try {
    const { svg } = await mermaid.render(uniqueId, chart);
    const clean = await sanitizeHTML(svg);
    svgWrap.innerHTML = clean;
    state = { svg: clean, hasSuccess: true };
    lastValidMap.set(svgWrap, state);
    spinner.style.display = 'none';
  } catch (e) {
    console.warn('[Sonata][Mermaid] render error', e);
    if (state.hasSuccess && state.svg) {
      svgWrap.innerHTML = state.svg; // keep last good
      spinner.style.display = 'none';
    } else {
      // Before first success, keep spinner; avoid noisy error boxes while streaming
      spinner.style.display = 'block';
    }
  }
}
