// GraphViz (viz.js) renderer with last-valid fallback
// - Lazy-loads @viz-js/viz (WASM) on first use
// - Preserves last valid SVG per container to avoid flicker during streaming

import { sanitizeHTML } from './dom-sanitize.js';

let vizInstancePromise = null;
const lastValidMap = new WeakMap(); // container -> { svg, hasSuccess }

async function getViz() {
  if (vizInstancePromise) return vizInstancePromise;
  vizInstancePromise = (async () => {
    // esm.sh inlines fetch of WASM and workers for browser ESM usage
    const mod = await import('https://esm.sh/@viz-js/viz@3.4.0');
    const viz = await mod.instance();
    return viz;
  })();
  return vizInstancePromise;
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

export async function renderDot(dot, container, opts = {}) {
  const viz = await getViz();
  container.setAttribute('data-diagram-container', '');
  const { header, body } = ensureBaseStructure(container);
  const labelEl = header.querySelector('[data-diagram-label]'); labelEl.textContent = (opts.label || 'GRAPHVIZ').toUpperCase();
  const copyBtn = header.querySelector('[data-diagram-copy]');
  const spinner = body.querySelector('[data-diagram-spinner]');
  const svgWrap = body.querySelector('[data-diagram-svg]');

  const fenced = '```' + (opts.lang || 'dot') + '\n' + dot + '\n```';
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(fenced); copyBtn.textContent='Copied'; setTimeout(()=>copyBtn.textContent='Copy', 1200); } catch {}
  };

  let state = lastValidMap.get(svgWrap) || { svg: '', hasSuccess: false };
  spinner.style.display = state.hasSuccess ? 'none' : 'block';

  try {
    const svg = viz.renderString(dot, { format: 'svg', yInvert: false });
    const clean = await sanitizeHTML(svg);
    svgWrap.innerHTML = clean;
    state = { svg: clean, hasSuccess: true };
    lastValidMap.set(svgWrap, state);
    spinner.style.display = 'none';
  } catch (e) {
    if (state.hasSuccess && state.svg) {
      svgWrap.innerHTML = state.svg;
      spinner.style.display = 'none';
    } else {
      spinner.style.display = 'block';
    }
  }
}

export function supportsGraphviz(lang) {
  const l = (lang || '').toLowerCase();
  return l === 'dot' || l === 'graphviz' || l === 'viz';
}
