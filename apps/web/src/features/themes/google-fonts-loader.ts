const loaded = new Set<string>()

export function googleFontCssUrl(family: string): string {
  const encoded = encodeURIComponent(family)
  return `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,300..700;1,300..700&display=swap`
}

export function loadGoogleFont(family: string): void {
  if (loaded.has(family)) return
  loaded.add(family)

  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = googleFontCssUrl(family)
  document.head.appendChild(link)
}

export function isGoogleFontId(id: string): boolean {
  return id.startsWith("gf:")
}

export function googleFontFamilyFromId(id: string): string {
  return id.slice(3)
}
