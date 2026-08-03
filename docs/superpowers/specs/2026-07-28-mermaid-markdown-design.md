# Mermaid diagrams in markdown surfaces — design

Date: 2026-07-28

## Goal

Render ` ```mermaid ` fenced code blocks as diagrams across every markdown
surface in the web app, instead of showing them as plain code.

## Surfaces in scope

| Surface                                                | File                                                               | Current markdown setup                       |
| ------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
| Markdown file preview                                  | `apps/web/src/features/main-tabs/components/file-content-view.tsx` | own `components` map incl. `code`/`pre`      |
| Chat (assistant body, thinking block, tool call cards) | `apps/web/src/features/chat/components/markdown-components.tsx`    | `CodeBlock` + Prism, compact & rich maps     |
| Skill detail page                                      | `apps/web/src/features/skills/components/skill-detail-page.tsx`    | `ReactMarkdown` with **no** `components` map |
| Remote markdown (release notes, update dialog)         | `apps/web/src/shared/components/remote-markdown.tsx`               | `components` map with only `a`               |

The four maps stay separate. They differ meaningfully (compact chat vs. full
prose vs. file-link resolution), and unifying them is a larger refactor than
this feature justifies.

## Architecture

Two new files under `apps/web/src/shared/`, plus a small branch at each of the
four call sites.

### `shared/lib/mermaid.ts` — loader singleton

- Caches a single `import("mermaid")` promise so the dependency is code-split
  out of the main chunk and fetched only when a diagram first appears.
- Calls `mermaid.initialize({ startOnLoad: false, securityLevel: "strict",
theme: "base", themeVariables })` once per theme.
- `themeVariables` is derived at call time from the live CSS custom properties
  on `document.documentElement` (`--background`, `--foreground`, `--primary`,
  `--border`, `--muted`, `--muted-foreground`). Diagrams therefore inherit the
  active theme — including user custom themes — with no hardcoded palette.
- Exposes a re-initialize path so a theme change re-applies `themeVariables`.

### `shared/components/mermaid-diagram.tsx` — the renderer

Props: `code: string`, optional `className`.

Render output:

- **Success** — `<div className="not-prose overflow-x-auto">` containing the
  SVG. Wide diagrams scroll inside their own container; the page body never
  scrolls horizontally. SVG is constrained with `max-width: 100%; height: auto`.
- **Pending / failed** — the raw fenced source, styled to match the existing
  code-block treatment on that surface.
- **Failed (settled)** — the raw source plus a small muted
  `Mermaid: <message>` line beneath it.

Hover controls, mirroring the existing `CopyButton` pattern in
`markdown-components.tsx`:

- copy source to clipboard;
- toggle between the rendered diagram and the raw ` ```mermaid ` source.

### Render lifecycle

This is what makes the chat surface safe during streaming.

1. An effect debounces ~250 ms after `code` last changed.
2. It then `await`s the loader, calls `mermaid.parse(code)`, then
   `mermaid.render(uniqueId, code)`.
3. A stale-run guard discards results from superseded renders (React 18 strict
   mode double-invoke under React 19 and rapid token updates both produce
   these).

Consequences:

- **While a chat message streams**, `code` changes on every token, so the
  debounce keeps resetting and no render is attempted. The raw code block stays
  on screen — no error flash, no half-drawn diagram.
- **On success**, the block swaps to the SVG.
- **On failure**, the error line appears only after the content has been stable
  for the debounce window. A genuinely broken diagram in a `.md` file reports
  its syntax error; a mid-stream one never does.

`mermaid.render` mutates the DOM and needs a unique id per instance — use a
`useId()`-derived id, sanitized to a valid CSS selector.

### Theme changes

`useTheme()` from `@/features/themes` supplies the resolved mode. The component
subscribes to it; a change re-initializes the loader with fresh
`themeVariables` and re-runs the render for the current `code`.

## Call-site wiring

Each surface adds a branch when the fence language is `mermaid`:

- `markdown-components.tsx` — inside `CodeBlock`, before the Prism path. This
  one edit covers the assistant body, thinking blocks, and tool call cards.
- `file-content-view.tsx` — inside its `code` component, in the `isBlock`
  branch. Note this surface renders fences through its own `pre`, so the
  mermaid branch must bypass that wrapper.
- `remote-markdown.tsx` — add a `code` entry to the existing `components` map.
- `skill-detail-page.tsx` — pass `components={{ code: … }}`; it currently
  passes none.

A shared helper (e.g. `isMermaidFence(className)`) keeps the branch to two
lines per site.

## Security

`securityLevel: "strict"` keeps mermaid's built-in DOMPurify sanitization on
and disables click handlers and inline HTML in diagram labels. Markdown reaching
these surfaces can come from an agent or from a remote release note, so the
strict level is required, not optional.

## Trade-offs accepted

- **Bundle weight.** `mermaid` is the heaviest dependency this app would add.
  Lazy loading contains the cost to users who actually view a diagram, but the
  dependency is real. Accepted deliberately.
- **Debounce latency.** A finished diagram takes ~250 ms plus load time to
  appear. Acceptable in exchange for flash-free streaming.

## Out of scope

- Click-to-zoom / pan dialog for large diagrams.
- Exporting a diagram as PNG or SVG.
- Unifying the four markdown component maps.
- Mermaid support anywhere outside the web app (server, desktop shell).

## Verification

`npm run check-types` and `npm run lint` in `apps/web`. The app is not launched
to verify, per standing project preference.
