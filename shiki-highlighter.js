// shiki-highlighter.js
// Shiki v3 highlighter manager with dual-theme output and copy button rendering.

let shikiPromise = null;
let jsEnginePromise = null;

async function getShiki() {
  if (!shikiPromise) {
    shikiPromise = import('https://esm.sh/shiki@3.2.1');
  }
  const mod = await shikiPromise;
  return mod;
}

async function getJsEngine() {
  if (!jsEnginePromise) {
    jsEnginePromise = import('https://esm.sh/shiki@3.2.1/engine/javascript');
  }
  const mod = await jsEnginePromise;
  return mod.createJavaScriptRegexEngine({ forgiving: true });
}

const PRE_TAG_REGEX = /<pre(\s|>)/;

class HighlighterManager {
  constructor() {
    this.lightHighlighter = null;
    this.darkHighlighter = null;
    this.lightTheme = null;
    this.darkTheme = null;
    this.loadedLanguages = new Set();
    this.initializationPromise = null;
  }

  async ensureHighlightersInitialized(themes, language) {
    const [lightTheme, darkTheme] = themes;
    const engine = await getJsEngine();

    const needsLightRecreate = !this.lightHighlighter || this.lightTheme !== lightTheme;
    const needsDarkRecreate = !this.darkHighlighter || this.darkTheme !== darkTheme;

    if (needsLightRecreate || needsDarkRecreate) {
      this.loadedLanguages.clear();
    }

    const { createHighlighter } = await getShiki();

    const needsLangLoad = !this.loadedLanguages.has(language);

    if (needsLightRecreate) {
      this.lightHighlighter = await createHighlighter({ themes: [lightTheme], langs: [language], engine });
      this.lightTheme = lightTheme;
      this.loadedLanguages.add(language);
    } else if (needsLangLoad) {
      await this.lightHighlighter.loadLanguage(language);
    }

    if (needsDarkRecreate) {
      const langsToLoad = needsLangLoad ? [...this.loadedLanguages, language] : Array.from(this.loadedLanguages);
      this.darkHighlighter = await createHighlighter({ themes: [darkTheme], langs: langsToLoad.length ? langsToLoad : [language], engine });
      this.darkTheme = darkTheme;
    } else if (needsLangLoad) {
      await this.darkHighlighter.loadLanguage(language);
    }

    if (needsLangLoad) this.loadedLanguages.add(language);
  }

  async highlight(code, lang, themes, preClassName = 'code-pre') {
    // Serialize initialization
    if (this.initializationPromise) await this.initializationPromise;
    this.initializationPromise = this.ensureHighlightersInitialized(themes, lang);
    await this.initializationPromise;
    this.initializationPromise = null;

    const [lightTheme, darkTheme] = themes;

    const addPreClass = (html) => html.replace(PRE_TAG_REGEX, `<pre class="${preClassName}"$1`);
    const removePreBackground = (html) => html.replace(/(<pre[^>]*)(style="[^"]*background[^";]*;?[^"]*")([^>]*>)/g, '$1$3');

    const htmlLight = removePreBackground(
      addPreClass(this.lightHighlighter.codeToHtml(code, { lang, theme: lightTheme }))
    );
    const htmlDark = removePreBackground(
      addPreClass(this.darkHighlighter.codeToHtml(code, { lang, theme: darkTheme }))
    );

    return { htmlLight, htmlDark };
  }
}

// Singleton
const manager = new HighlighterManager();

export async function highlight(code, lang, themes, preClassName = 'code-pre') {
  try {
    return await manager.highlight(code, lang, themes, preClassName);
  } catch (e) {
    // Fallback to plain text pre if highlighting fails
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<pre class="${preClassName}"><code>${esc(code)}</code></pre>`;
    return { htmlLight: html, htmlDark: html };
  }
}

export function renderCodeBlock(container, { code, lang, htmlLight, htmlDark, onCopy }) {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'codeblock-container';
  wrapper.setAttribute('data-code-block-container', '');
  if (lang) wrapper.setAttribute('data-language', lang);

  const header = document.createElement('div');
  header.className = 'codeblock-header';
  header.setAttribute('data-code-block-header', '');
  const label = document.createElement('span');
  label.className = 'code-lang-label';
  label.textContent = (lang || 'text').toLowerCase();
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code || '');
      const prev = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.disabled = true;
      setTimeout(() => { copyBtn.textContent = prev; copyBtn.disabled = false; }, 2000);
      onCopy && onCopy();
    } catch (err) {
      // noop
    }
  });
  const headerRight = document.createElement('div');
  headerRight.appendChild(copyBtn);
  header.appendChild(label);
  header.appendChild(headerRight);

  const body = document.createElement('div');
  body.className = 'codeblock-body';

  const paneLight = document.createElement('div');
  paneLight.className = 'code-pane code-pane-light';
  paneLight.setAttribute('data-theme', 'light');
  paneLight.innerHTML = htmlLight;

  const paneDark = document.createElement('div');
  paneDark.className = 'code-pane code-pane-dark';
  paneDark.setAttribute('data-theme', 'dark');
  paneDark.innerHTML = htmlDark;

  body.appendChild(paneLight);
  body.appendChild(paneDark);

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  container.appendChild(wrapper);
}
