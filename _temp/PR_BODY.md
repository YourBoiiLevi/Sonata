# Milestone 1: Shiki + streamed Mermaid with last-valid fallback; block-level incremental renderer

This PR replaces the legacy full-buffer Prism pipeline with a block-level streaming renderer inspired by Streamdown. It introduces Shiki for dual-theme code highlighting, per-block incremental updates, and resilient streaming diagram rendering (Mermaid now, Viz.js support included for DOT/GraphViz).

## Summary of changes

- Code highlighting
  - Replaced Prism with Shiki (dual themes: defaults to `github-light`/`github-dark`).
  - HighlighterManager-style singleton with forgiving regex engine and language caching.
  - Custom `preClassName` support via `window.SONATA_SHIKI_PRE_CLASS` or `data-pre-class-name`.
  - Copy button on every code block copies the exact fenced source (including language tag).
  - Dual HTML panes for light/dark, switched via `prefers-color-scheme` or a `.theme-dark` class.

- Streaming rendering architecture
  - New `streaming-markdown.js` maintains a block-wise model of the message.
  - Parses streaming text into stable blocks (paragraphs, lists, fenced code/diagrams) and diffs per chunk.
  - Only changed blocks update; no whole-message reflows, minimizing flicker.
  - Preserves Sonata inline transforms (spoiler `||text||`, `[[Ctrl+C]]`, `==highlight==`) as a pre-processing step.
  - All HTML sanitized via DOMPurify (`dom-sanitize.js`) with SVG allowed; optional link/image allowlists.
  - KaTeX auto-render runs on just-updated block subtrees.

- Mermaid streaming
  - New `mermaid-renderer.js` lazy-loads Mermaid once, initializes with `suppressErrorRendering: true`.
  - Maintains a `lastValidSvg` per block; during partial/invalid streaming, previously valid SVG persists without flicker.
  - Shows a small spinner only before the first successful render.

- GraphViz (Milestone 2 groundwork)
  - New `viz-renderer.js` lazy-loads `@viz-js/viz` (WASM) on demand.
  - Supports `dot`, `graphviz`, and `viz` code fences with the same last-valid-SVG behavior.
  - Handles multiple graphs without UI freeze by rendering into off-DOM containers before swap.

- Optional D3 sandbox (Milestone 3 scaffolding)
  - `d3-renderer.js` + `d3-sandbox.html` behind `window.SONATA_ENABLE_D3 = false` (default).
  - Sandboxed iframe (`allow-scripts allow-same-origin`); supports DOT via `d3-graphviz` path with last-valid behavior.

- Integration
  - `index.html` now imports the streaming renderer via `<script type="module">` and routes assistant messages through it.
  - Prism assets removed. Minimal CSS for code block container/header and diagram containers/copy buttons added.
  - Existing inline `onclick` for spoilers replaced by delegated handlers in sanitized markup (keeps security intact).
  - `server.js` system instruction extended to nudge explicit language tags: `mermaid`, `dot|graphviz|viz`, `svg`, `d3-graphviz`, `d3` with small examples.

## Risks and notes
- Uses ESM/CDN modules (Shiki, Mermaid, Viz WASM) — first use incurs a lazy-load; subsequent renders are cached.
- Module script scope means we explicitly attach UI functions (`openSettingsModal`, etc.) onto `window` to preserve existing inline handlers.
- DOMPurify removes inline event handlers for safety; spoiler reveal now uses delegated JS after sanitize.

## Testing instructions
1) Code highlighting
   - Prompt: "Show a JavaScript function and a Python snippet in separate fences."
   - Verify dual-theme switching via system `prefers-color-scheme` (or add a `.theme-dark` class to `body`) without re-highlight flicker.
   - Use the per-block Copy button; it should include the exact fences and language tag.

2) Mermaid streaming
   - Prompt: "Stream a Mermaid flowchart step-by-step. Start incomplete (missing closing), then complete it."
   - Expected: Spinner shows before first valid render; once a valid SVG appears, subsequent syntax errors keep the last valid SVG (no red error/flicker).

3) Block-level updates
   - Prompt a long answer mixing paragraphs, lists, code, and a Mermaid diagram.
   - While streaming, only the currently growing block should update; earlier blocks should remain stable with no reflow flicker.

4) GraphViz (Milestone 2)
   - Prompt: "Generate two DOT graphs in separate fences (dot/graphviz)." Optionally stream one while sending another.
   - Expected: Both render to SVG via Viz (WASM lazy-load logged in console). Each graph maintains last-valid rendering.

5) Optional D3 (off by default)
   - Set `window.SONATA_ENABLE_D3 = true` in devtools and prompt a simple `d3-graphviz` DOT fence.
   - Expected: Renders inside sandboxed iframe; falls back to last-valid on errors.

## QA checklist
- [ ] Code blocks use Shiki dual themes; switching theme updates colors without re-highlighting flicker
- [ ] Copy button copies exact fenced source (including language tags)
- [ ] Mermaid streaming keeps last valid SVG on partial syntax; spinner only before first success
- [ ] Block-level updates avoid whole-message reflows; no visible flicker for normal text
- [ ] GraphViz DOT renders to SVG (Milestone 2) with last-valid behavior; handles two concurrent graphs
- [ ] D3 sandbox (Milestone 3) disabled by default; when enabled, runs only in iframe sandbox and preserves last valid render on errors
- [ ] DOMPurify sanitization active on all markdown HTML
- [ ] Lazy-loading of heavy libs verified (Shiki, Mermaid, Viz) and no regressions in performance

## Expected console output (for lazy loads)
- Shiki highlighter initialized (themes, engine)
- Mermaid module initialized (once)
- Viz WASM instance created (on first DOT render)
- D3 sandbox sends `d3-ready` (only when enabled)

## Changes
- Replace Prism with Shiki dual-theme highlighting and per-block copy buttons
- Introduce block-level streaming renderer with DOMPurify sanitization and KaTeX-on-block
- Add resilient Mermaid streaming renderer (last-valid fallback + spinner)
- Add Viz.js renderer for DOT/GraphViz (lazy WASM)
- D3 sandbox scaffolding (disabled by default)
- Update server system prompt to encourage explicit language tags

Please verify on Chrome and Firefox (and Safari if available).