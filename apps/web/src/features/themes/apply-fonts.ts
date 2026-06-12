const FONT_STYLE_ELEMENT_ID = "lambda-font-overrides"

export function applyFonts(
  uiFont: string,
  chatFont: string,
  monoFont: string,
  codeFont: string
) {
  let el = document.getElementById(
    FONT_STYLE_ELEMENT_ID
  ) as HTMLStyleElement | null

  if (!el) {
    el = document.createElement("style")
    el.id = FONT_STYLE_ELEMENT_ID
    document.head.appendChild(el)
  }

  el.textContent = `:root {
  --app-font-sans: ${uiFont};
  --app-font-chat: ${chatFont};
  --app-font-mono: ${monoFont};
  --app-font-code: ${codeFont};
}`
}
