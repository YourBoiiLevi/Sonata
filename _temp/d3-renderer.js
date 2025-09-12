// Optional D3 renderer (sandboxed iframe). Disabled by default via window.SONATA_ENABLE_D3.
// Provides a DOT path via d3-graphviz inside sandbox. Last-valid behavior maintained in parent.

import { sanitizeHTML } from './dom-sanitize.js';

const lastValidMap = new WeakMap(); // container -> { svg, hasSuccess }

export function isD3Enabled() { return !!window.SONATA_ENABLE_D3; }

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

let iframePromise = null;
async function getSandboxIframe(parentContainer) {
  if (iframePromise) return iframePromise;
  iframePromise = new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.src = './d3-sandbox.html';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; // hidden but same-origin
    document.body.appendChild(iframe);
    function onMsg(ev) {
      if (ev.source === iframe.contentWindow && ev.data && ev.data.type === 'd3-ready') {
        window.removeEventListener('message', onMsg);
        resolve(iframe);
      }
    }
    window.addEventListener('message', onMsg);
  });
  return iframePromise;
}

export async function renderD3Graphviz(dot, container, opts = {}) {
  container.setAttribute('data-diagram-container', '');
  const { header, body } = ensureBaseStructure(container);
  const labelEl = header.querySelector('[data-diagram-label]'); labelEl.textContent = 'D3-GRAPHVIZ';
  const copyBtn = header.querySelector('[data-diagram-copy]');
  const spinner = body.querySelector('[data-diagram-spinner]');
  const svgWrap = body.querySelector('[data-diagram-svg]');

  const fenced = '```d3-graphviz\n' + dot + '\n```';
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(fenced); copyBtn.textContent='Copied'; setTimeout(()=>copyBtn.textContent='Copy', 1200); } catch {}
  };

  let state = lastValidMap.get(svgWrap) || { svg: '', hasSuccess: false };
  spinner.style.display = state.hasSuccess ? 'none' : 'block';

  if (!isD3Enabled()) {
    // If disabled, just keep previous valid or show a note once
    if (!state.hasSuccess) {
      svgWrap.innerHTML = '<div style="font-size:12px;color:#666">D3 rendering is disabled (SONATA_ENABLE_D3=false)</div>';
    } else {
      svgWrap.innerHTML = state.svg;
    }
    return;
  }

  const iframe = await getSandboxIframe(container);
  const win = iframe.contentWindow;

  const result = await new Promise((resolve) => {
    function onMsg(ev) {
      if (ev.source !== win) return;
      if (!ev.data) return;
      if (ev.data.type === 'd3-result' && ev.data.id === reqId) {
        window.removeEventListener('message', onMsg);
        resolve(ev.data);
      }
    }
    window.addEventListener('message', onMsg);
    const reqId = Math.random().toString(36).slice(2);
    win.postMessage({ type: 'render-dot', id: reqId, dot }, '*');
  });

  if (result.ok && result.svg) {
    const clean = await sanitizeHTML(result.svg);
    svgWrap.innerHTML = clean;
    state = { svg: clean, hasSuccess: true };
    lastValidMap.set(svgWrap, state);
    spinner.style.display = 'none';
  } else {
    if (state.hasSuccess && state.svg) {
      svgWrap.innerHTML = state.svg;
      spinner.style.display = 'none';
    } else {
      spinner.style.display = 'block';
    }
  }
}
