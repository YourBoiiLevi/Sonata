// Streaming Markdown renderer for Sonata (vanilla, Streamdown-inspired)
// - Parses incoming text buffer into stable blocks (md, code, diagrams)
// - Diffs and only updates changed blocks per chunk
// - Dispatches to Shiki for code and Mermaid for diagrams; DOT/D3 temporarily disabled

import { marked } from 'https://cdn.jsdelivr.net/npm/marked@9.1.2/lib/marked.esm.js';
import { sanitizeHTML } from './dom-sanitize.js';
import { renderCodeBlock } from './shiki-highlighter.js';
import { renderMermaid } from './mermaid-renderer.js';

const stateByContainer = new WeakMap();

function preProcessInline(text) {
  return text
    .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" data-spoiler>$1</span>')
    .replace(/\[\[(.*?)\]\]/g, '<kbd class="kbd">$1</kbd>')
    .replace(/==(.*?)==/g, '<mark>$1</mark>');
}

function getThemeVersion(){ return window.SONATA_SHIKI_VERSION || 0; }

function parseBlocks(src) {
  const lines = (src || '').split('\n');
  const blocks = [];
  let i = 0;
  let buf = [];
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(```+|~~~+)\s*([^\s`]*)?(.*)$/);
    if (m) {
      if (buf.length) { blocks.push({ kind: 'md', text: buf.join('\n') }); buf = []; }
      const ticks = m[1];
      let lang = (m[2] || '').trim();
      const rest = (m[3] || '').trim();
      const languageMatch = (lang + ' ' + rest).match(/language-([^\s]+)/);
      if (languageMatch && !lang) lang = languageMatch[1];
      const code = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const l = lines[i];
        if (l.startsWith(ticks) && l.trim() === ticks) { closed = true; i++; break; }
        code.push(l); i++;
      }
      const language = (lang || '').toLowerCase();
      const text = code.join('\n');
      if (language === 'mermaid') {
        blocks.push({ kind: 'diagram', engine: 'mermaid', lang: 'mermaid', code: text, closed });
      } else if (language === 'svg') {
        blocks.push({ kind: 'diagram', engine: 'svg', lang: 'svg', code: text, closed });
      } else {
        blocks.push({ kind: 'code', lang: language || 'text', code: text, closed, tver: getThemeVersion() });
      }
      continue;
    }
    buf.push(line);
    i++;
  }
  if (buf.length) blocks.push({ kind: 'md', text: buf.join('\n') });
  return blocks;
}

function getPreClassName(root) {
  const d = root?.dataset?.preClassName; if (d) return d;
  return window.SONATA_SHIKI_PRE_CLASS || 'sonata-pre';
}

function attachInteractivity(root) {
  root.querySelectorAll('.spoiler[data-spoiler]').forEach(node => {
    node.addEventListener('click', () => node.classList.add('revealed'), { once: false });
  });
}

async function renderMarkdownBlock(el, text) {
  const html = marked.parse(preProcessInline(text || ''));
  el.innerHTML = await sanitizeHTML(html);
  attachInteractivity(el);
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, { delimiters:[
        {left:'$$',right:'$$',display:true}, {left:'$',right:'$',display:false}, {left:'\\(',right:'\\)',display:false}, {left:'\\[',right:'\\]',display:true}
      ]});
    } catch {}
  }
}

async function renderCodeBlockInto(el, block, preClassName) {
  const node = await renderCodeBlock({ code: block.code, lang: block.lang, preClassName });
  // Sanitize the panes content
  const paneLight = node.querySelector('[data-code-pane][data-theme="light"]');
  const paneDark = node.querySelector('[data-code-pane][data-theme="dark"]');
  if (paneLight) paneLight.innerHTML = await sanitizeHTML(paneLight.innerHTML);
  if (paneDark) paneDark.innerHTML = await sanitizeHTML(paneDark.innerHTML);
  el.replaceChildren(node);
}

async function renderDiagramBlockInto(el, block) {
  if (block.engine === 'mermaid') {
    await renderMermaid(block.code, el, { uniqueId: el.dataset.uid });
  } else if (block.engine === 'svg') {
    // Raw SVG (sanitized)
    const clean = await sanitizeHTML(block.code);
    el.setAttribute('data-diagram-container', '');
    el.innerHTML = clean;
  }
}

export function createStreamingRenderer() {
  return {
    update: async (root, text) => {
      let st = stateByContainer.get(root);
      if (!st) { st = { blocks: [], nodes: [] }; stateByContainer.set(root, st); }
      const nextBlocks = parseBlocks(text || '');
      const maxLen = Math.max(st.blocks.length, nextBlocks.length);
      const preClassName = getPreClassName(root);

      for (let i = 0; i < maxLen; i++) {
        const prev = st.blocks[i];
        const cur = nextBlocks[i];
        if (!cur) {
          // remove trailing
          if (st.nodes[i]) st.nodes[i].remove();
          continue;
        }
        // Ensure node exists
        let node = st.nodes[i];
        if (!node) {
          node = document.createElement('div');
          node.setAttribute('data-message-block', '');
          root.appendChild(node);
          st.nodes[i] = node;
        }
        // Decide if update needed
        const changed = !prev || JSON.stringify(prev) !== JSON.stringify(cur);
        if (!changed) continue;
        // Render by type
        if (cur.kind === 'md') {
          await renderMarkdownBlock(node, cur.text);
        } else if (cur.kind === 'code') {
          await renderCodeBlockInto(node, cur, preClassName);
        } else if (cur.kind === 'diagram') {
          await renderDiagramBlockInto(node, cur);
        }
      }

      // Remove extra old nodes
      for (let i = nextBlocks.length; i < st.nodes.length; i++) {
        const n = st.nodes[i]; if (n && n.parentElement === root) n.remove();
      }
      st.nodes.length = nextBlocks.length;
      st.blocks = nextBlocks;
      // Scroll root to bottom smoothly
      if (root.parentElement && root.parentElement.scrollHeight - root.parentElement.scrollTop - root.parentElement.clientHeight < 48) {
        root.parentElement.scrollTop = root.parentElement.scrollHeight;
      }
    }
  };
}

// Singleton for convenience
export const streamingRenderer = createStreamingRenderer();
