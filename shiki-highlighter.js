// Shiki Highlighter Manager for Sonata (Streamdown-inspired)
// - Single highlighter with dual themes (light/dark)
// - Forgiving JavaScript regex engine
// - Language caching and on-demand loading
// - Returns dual HTML outputs and strips pre background styles

let highlighterPromise = null;
let loadedLangs = new Set();
let themePair = null; // [light, dark]
const THEME_OPTIONS = ['ayu-dark','vitesse-dark','github-dark','github-light','monokai'];

function getThemes() {
  if (Array.isArray(window.SONATA_SHIKI_THEMES) && window.SONATA_SHIKI_THEMES.length === 2) return window.SONATA_SHIKI_THEMES;
  const container = document.getElementById('transcript');
  const attr = container?.dataset?.shikiThemes;
  if (attr) {
    const parts = attr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) return parts;
  }
  return ['github-light', 'github-dark'];
}

export function setShikiThemes(pair){
  window.SONATA_SHIKI_THEMES = pair;
  themePair = pair;
  highlighterPromise = null; // force re-init on next use
  loadedLangs = new Set();
}

async function getHighlighter() {
  if (highlighterPromise) return highlighterPromise;
  highlighterPromise = (async () => {
    themePair = getThemes();
    const [{ codeToHtml, createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
      import('https://esm.sh/shiki@1.23.0'),
      import('https://esm.sh/@shikijs/engine-javascript@1.23.0')
    ]);
    const engine = createJavaScriptRegexEngine({ forgiving: true });
    const hl = await createHighlighter({
      themes: themePair,
      langs: ['javascript', 'typescript', 'json', 'markdown', 'bash', 'html', 'css', 'python', 'java', 'c', 'cpp'],
      engine
    });
    loadedLangs = new Set(['javascript','typescript','json','markdown','bash','html','css','python','java','c','cpp']);
    // Attach helpers to instance for reuse
    hl.__codeToHtml = codeToHtml;
    hl.__engine = engine;
    return hl;
  })();
  return highlighterPromise;
}

async function ensureLanguage(lang) {
  if (!lang) return;
  const hl = await getHighlighter();
  if (!loadedLangs.has(lang)) {
    try { await hl.loadLanguage(lang); loadedLangs.add(lang); } catch { /* noop */ }
  }
}

function stripBackgroundStylePre(html) {
  // Remove background-related styles from <pre style="..."> while preserving other CSS variables
  return html.replace(/<pre([^>]*?)style=\"([^\"]*)\"/g, (m, attrs, style) => {
    const newStyle = style.replace(/background[^:]*:[^;\"]*;?/gi, '');
    if (newStyle.trim().length === 0) return `<pre${attrs}`;
    return `<pre${attrs}style="${newStyle}"`;
  });
}

export async function highlightToDualHTML(code, lang, options = {}) {
  const hl = await getHighlighter();
  const [lightTheme, darkTheme] = themePair;
  await ensureLanguage(lang);
  const preClassName = options.preClassName ? ` ${options.preClassName}` : '';
  let htmlLight = await hl.codeToHtml(code, { lang: lang || 'text', theme: lightTheme });
  let htmlDark = await hl.codeToHtml(code, { lang: lang || 'text', theme: darkTheme });
  htmlLight = stripBackgroundStylePre(htmlLight).replace('<pre class="shiki"', `<pre class="shiki${preClassName}" data-code-block data-theme="light"`);
  htmlDark = stripBackgroundStylePre(htmlDark).replace('<pre class="shiki"', `<pre class="shiki${preClassName}" data-code-block data-theme="dark"`);
  return { htmlLight, htmlDark };
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true;
    } catch { return false; }
  }
}

export async function renderCodeBlock({ code, lang, preClassName }) {
  const { htmlLight, htmlDark } = await highlightToDualHTML(code, lang, { preClassName });
  const container = document.createElement('div');
  container.setAttribute('data-code-block-container', '');

  const header = document.createElement('div');
  header.setAttribute('data-code-block-header', '');
  const label = document.createElement('span'); label.textContent = (lang || 'text').toUpperCase();
  const tools = document.createElement('div'); tools.style.display='flex'; tools.style.gap='6px'; tools.style.alignItems='center';
  const themeSelect = document.createElement('select'); themeSelect.setAttribute('data-code-theme-select','');
  THEME_OPTIONS.forEach(t=>{ const opt=document.createElement('option'); opt.value=t; opt.textContent=t; themeSelect.appendChild(opt); });
  const currentTheme = window.SONATA_CODE_THEME || (Array.isArray(window.SONATA_SHIKI_THEMES)?window.SONATA_SHIKI_THEMES[0]:'github-dark');
  themeSelect.value = currentTheme;
  themeSelect.addEventListener('change', ()=>{
    if (typeof window.__sonataSetCodeTheme === 'function') window.__sonataSetCodeTheme(themeSelect.value);
  });
  const copy = document.createElement('button'); copy.type = 'button'; copy.setAttribute('data-code-copy', ''); copy.textContent = 'Copy';
  tools.appendChild(themeSelect); tools.appendChild(copy);
  header.appendChild(label); header.appendChild(tools);

  const panes = document.createElement('div'); panes.setAttribute('data-code-panes', '');
  const paneLight = document.createElement('div'); paneLight.setAttribute('data-code-pane', ''); paneLight.setAttribute('data-theme', 'light');
  const paneDark = document.createElement('div'); paneDark.setAttribute('data-code-pane', ''); paneDark.setAttribute('data-theme', 'dark');

  // Do not sanitize the Shiki HTML here; it will be sanitized by the caller before insertion into the message subtree.
  // However, to keep consistent APIs, we still set innerHTML here and rely on outer subtree sanitization.
  paneLight.innerHTML = htmlLight;
  paneDark.innerHTML = htmlDark;

  panes.appendChild(paneLight); panes.appendChild(paneDark);
  container.appendChild(header); container.appendChild(panes);

  const fenced = '```' + (lang || '') + '\n' + code + '\n```';
  copy.addEventListener('click', async () => {
    const ok = await copyToClipboard(fenced);
    if (ok) { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); }
  });

  return container;
}
