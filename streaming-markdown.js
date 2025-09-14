// streaming-markdown.js
// Vanilla JS streaming markdown renderer with block-level diffing, Shiki dual-theme highlighting,
// Mermaid with last-valid fallback, DOMPurify sanitization, and KaTeX pass on updated blocks.

import { sanitize, sanitizeInto } from './dom-sanitize.js';
import { highlight as shikiHighlight, renderCodeBlock } from './shiki-highlighter.js';
import { renderMermaid } from './mermaid-renderer.js';

const DEFAULT_LIGHT_THEME = 'vitesse-light';
const DEFAULT_DARK_THEME = 'vitesse-dark';

function ensureGlobalsInitialized() {
  if (!window.SONATA_CODE_THEME_MODE) window.SONATA_CODE_THEME_MODE = 'dark'; // Force Dark by default
  if (!window.SONATA_SHIKI_THEMES) window.SONATA_SHIKI_THEMES = [DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME];
  if (!window.SONATA_MERMAID_THEME) window.SONATA_MERMAID_THEME = 'neutral';
  if (!window.SONATA_MERMAID_SECURITY) window.SONATA_MERMAID_SECURITY = 'strict';
}

export function applyRenderingSettings() {
  ensureGlobalsInitialized();
  const mode = window.SONATA_CODE_THEME_MODE || 'dark';
  document.body.setAttribute('data-code-theme', mode);
}

export function initRenderingSettings() {
  // Load from localStorage
  const mode = localStorage.getItem('sonata.codeThemeMode') || 'dark';
  const lightTheme = localStorage.getItem('sonata.shikiLightTheme') || DEFAULT_LIGHT_THEME;
  const darkTheme = localStorage.getItem('sonata.shikiDarkTheme') || DEFAULT_DARK_THEME;
  const mermaidTheme = localStorage.getItem('sonata.mermaidTheme') || 'neutral';
  const mermaidSecurity = localStorage.getItem('sonata.mermaidSecurity') || 'strict';

  window.SONATA_CODE_THEME_MODE = mode; // 'auto' | 'dark' | 'light'
  window.SONATA_SHIKI_THEMES = [lightTheme, darkTheme];
  window.SONATA_MERMAID_THEME = mermaidTheme;
  window.SONATA_MERMAID_SECURITY = mermaidSecurity;
  applyRenderingSettings();
}

// Helpers
function escHtml(s) { return (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function preprocessInline(text) {
  // spoilers: ||secret|| => <span class="spoiler" data-spoiler>secret</span>
  // kbd: [[Ctrl+C]] => <kbd class="kbd">Ctrl+C</kbd>
  // highlight: ==text== => <mark>text</mark>
  return text
    .replace(/\|\|(.*?)\|\|/gs, '<span class="spoiler" data-spoiler>$1</span>')
    .replace(/\[\[(.*?)\]\]/gs, '<kbd class="kbd">$1</kbd>')
    .replace(/==(.*?)==/gs, '<mark>$1</mark>');
}

function parseBlocks(input) {
  const lines = (input || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i];
    // Code fence
    const fenceMatch = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fenceMatch) {
      const lang = (fenceMatch[1] || '').trim().toLowerCase();
      const type = lang === 'mermaid' ? 'mermaid' : 'code';
      const start = i + 1;
      let end = start;
      while (end < lines.length && !/^```\s*$/.test(lines[end])) end++;
      const closed = end < lines.length && /^```\s*$/.test(lines[end]);
      const content = lines.slice(start, closed ? end : lines.length).join('\n');
      blocks.push({ type, lang, content });
      i = closed ? end + 1 : lines.length; // consume to end if unclosed
      continue;
    }

    // List block (ordered or unordered)
    if (/^(\s*([-*+]\s+|\d+\.\s+)).*/.test(line)) {
      const start = i;
      let end = i;
      while (end < lines.length && /(\s*([-*+]\s+|\d+\.\s+)).*/.test(lines[end])) end++;
      const content = lines.slice(start, end).join('\n');
      blocks.push({ type: 'markdown', lang: '', content });
      i = end;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const start = i;
      let end = i;
      while (end < lines.length && /^>\s?/.test(lines[end])) end++;
      const content = lines.slice(start, end).join('\n');
      blocks.push({ type: 'markdown', lang: '', content });
      i = end;
      continue;
    }

    // Heading
    if (/^#{1,6}\s+/.test(line)) {
      const start = i;
      let end = i + 1;
      // Headings end at blank line
      while (end < lines.length && lines[end].trim() !== '') end++;
      const content = lines.slice(start, end).join('\n');
      blocks.push({ type: 'markdown', lang: '', content });
      i = end;
      continue;
    }

    // Paragraph
    if (line.trim() !== '') {
      const start = i;
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== '' && !/^```/.test(lines[end])) end++;
      const content = lines.slice(start, end).join('\n');
      blocks.push({ type: 'markdown', lang: '', content });
      i = end;
      continue;
    }

    // Blank line
    i++;
  }

  // Assign stable IDs by order and type
  return blocks.map((b, idx) => ({ id: `${idx}:${b.type}`, ...b }));
}

function runKaTeX(element) {
  if (!window.renderMathInElement) return;
  try {
    window.renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
    });
  } catch (e) {}
}

function markedParse(text) {
  const m = window.marked;
  if (!m) return escHtml(text);
  return m.parse(text);
}

export class StreamingRenderer {
  constructor() {
    this.prevBlocks = [];
    this.blockEls = new Map(); // id -> element
    this.mermaidStates = new Map(); // id -> { lastValidSvg, firstLoaded }
    this.spoilerListenerAttached = false;
    this.container = null;
    this.lastText = '';
  }

  attachListenersOnce(container) {
    if (this.spoilerListenerAttached) return;
    container.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('spoiler')) {
        t.classList.add('revealed');
      }
    });
    this.spoilerListenerAttached = true;
  }

  async renderBlock(block, el) {
    const [lightTheme, darkTheme] = window.SONATA_SHIKI_THEMES || [DEFAULT_LIGHT_THEME, DEFAULT_DARK_THEME];

    if (!el) {
      el = document.createElement('div');
      el.className = 'sm-block';
      el.setAttribute('data-sm-block', '');
      el.setAttribute('data-sm-type', block.type);
    }

    if (block.type === 'code') {
      el.setAttribute('data-language', block.lang || 'text');
      const { htmlLight, htmlDark } = await shikiHighlight(block.content, block.lang || 'text', [lightTheme, darkTheme], 'code-pre');
      // Sanitize HTML before insertion
      const safeLight = await sanitize(htmlLight);
      const safeDark = await sanitize(htmlDark);
      renderCodeBlock(el, { code: block.content, lang: block.lang || 'text', htmlLight: safeLight, htmlDark: safeDark });
      return el;
    }

    if (block.type === 'mermaid') {
      el.innerHTML = '';
      el.setAttribute('data-language', 'mermaid');
      // Header with copy button
      const header = document.createElement('div');
      header.className = 'codeblock-header';
      header.setAttribute('data-code-block-header', '');
      const label = document.createElement('span');
      label.className = 'code-lang-label';
      label.textContent = 'mermaid';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(block.content || '');
          const prev = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          copyBtn.disabled = true;
          setTimeout(() => { copyBtn.textContent = prev; copyBtn.disabled = false; }, 2000);
        } catch {}
      });
      const headerRight = document.createElement('div');
      headerRight.appendChild(copyBtn);
      header.appendChild(label);
      header.appendChild(headerRight);

      const body = document.createElement('div');
      body.className = 'mermaid-body';
      const state = this.mermaidStates.get(block.id) || { lastValidSvg: undefined, firstLoaded: false };
      this.mermaidStates.set(block.id, state);
      await renderMermaid(body, block.content, state);

      // Wrap in container for consistent styling
      const wrapper = document.createElement('div');
      wrapper.className = 'codeblock-container';
      wrapper.setAttribute('data-code-block-container', '');
      wrapper.appendChild(header);
      wrapper.appendChild(body);

      el.appendChild(wrapper);
      return el;
    }

    // markdown
    const processed = preprocessInline(block.content);
    const html = markedParse(processed);
    await sanitizeInto(el, html);
    runKaTeX(el);
    return el;
  }

  async update(containerEl, text) {
    this.lastText = text || '';
    ensureGlobalsInitialized();
    applyRenderingSettings();
    this.container = containerEl;
    this.attachListenersOnce(containerEl);

    const newBlocks = parseBlocks(text || '');

    // Diff by position and type; update only changed blocks
    const parent = containerEl;
    const maxLen = Math.max(this.prevBlocks.length, newBlocks.length);

    for (let i = 0; i < newBlocks.length; i++) {
      const b = newBlocks[i];
      const prev = this.prevBlocks[i];
      const existingEl = this.blockEls.get(b.id);

      if (prev && prev.id === b.id && prev.content === b.content && prev.type === b.type && existingEl) {
        // Unchanged; just ensure order
        parent.appendChild(existingEl);
        continue;
      }

      // Changed or new
      let el = existingEl;
      el = await this.renderBlock(b, el);
      this.blockEls.set(b.id, el);
      parent.appendChild(el);
    }

    // Remove extra old blocks
    for (let i = newBlocks.length; i < this.prevBlocks.length; i++) {
      const old = this.prevBlocks[i];
      const el = this.blockEls.get(old.id);
      if (el && el.parentNode === parent) parent.removeChild(el);
      this.blockEls.delete(old.id);
      this.mermaidStates.delete(old.id);
    }

    this.prevBlocks = newBlocks;
  }

  async forceRerenderAll() {
    if (!this.container) return;
    const text = this.lastText || '';
    const container = this.container;
    this.prevBlocks = [];
    if (container) container.innerHTML = '';
    await this.update(container, text);
  }

  reset() {
    this.prevBlocks = [];
    this.blockEls.clear();
    this.mermaidStates.clear();
    if (this.container) this.container.innerHTML = '';
  }
}
