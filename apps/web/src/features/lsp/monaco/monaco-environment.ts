/**
 * Monaco bootstrap for a Vite/Electron bundle.
 *
 * We bundle `monaco-editor` locally (no CDN loader) and wire its web workers
 * through Vite's `?worker` imports. `@monaco-editor/react` is pointed at this
 * bundled instance via `loader.config`, so it never tries to fetch Monaco from
 * the network — important for the desktop (offline) build.
 *
 * Importing this module for its side effects is enough; it is idempotent.
 */
import { loader } from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import {
  typescriptDefaults,
  javascriptDefaults,
} from "monaco-editor/esm/vs/language/typescript/monaco.contribution"
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker"
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker"
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker"
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker"

let configured = false

export function ensureMonacoEnvironment() {
  if (configured) return
  configured = true

  ;(self as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment =
    {
      getWorker(_workerId, label) {
        switch (label) {
          case "json":
            return new jsonWorker()
          case "css":
          case "scss":
          case "less":
            return new cssWorker()
          case "html":
          case "handlebars":
          case "razor":
            return new htmlWorker()
          case "typescript":
          case "javascript":
            return new tsWorker()
          default:
            return new editorWorker()
        }
      },
    }

  // Our own LSP provides diagnostics; silence Monaco's bundled TS/JS language
  // service so we don't get a second, project-unaware set of markers. The
  // worker is still used for syntax colorization.
  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  })
  javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
    noSuggestionDiagnostics: true,
  })

  loader.config({ monaco })
}

export { monaco }
