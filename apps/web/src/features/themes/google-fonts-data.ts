export type GoogleFontCategory =
  | "sans-serif"
  | "serif"
  | "monospace"
  | "display"
  | "handwriting"

export interface GoogleFont {
  family: string
  category: GoogleFontCategory
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // ── Sans-serif ──────────────────────────────────────────────────────────────
  { family: "Inter", category: "sans-serif" },
  { family: "Roboto", category: "sans-serif" },
  { family: "Open Sans", category: "sans-serif" },
  { family: "Lato", category: "sans-serif" },
  { family: "Montserrat", category: "sans-serif" },
  { family: "Source Sans 3", category: "sans-serif" },
  { family: "Nunito", category: "sans-serif" },
  { family: "Poppins", category: "sans-serif" },
  { family: "Raleway", category: "sans-serif" },
  { family: "Ubuntu", category: "sans-serif" },
  { family: "Work Sans", category: "sans-serif" },
  { family: "Karla", category: "sans-serif" },
  { family: "Barlow", category: "sans-serif" },
  { family: "Mulish", category: "sans-serif" },
  { family: "Manrope", category: "sans-serif" },
  { family: "DM Sans", category: "sans-serif" },
  { family: "Figtree", category: "sans-serif" },
  { family: "Plus Jakarta Sans", category: "sans-serif" },
  { family: "Space Grotesk", category: "sans-serif" },
  { family: "Urbanist", category: "sans-serif" },
  { family: "Rubik", category: "sans-serif" },
  { family: "Jost", category: "sans-serif" },
  { family: "Lexend", category: "sans-serif" },
  { family: "Sora", category: "sans-serif" },
  { family: "Cabin", category: "sans-serif" },
  { family: "Quicksand", category: "sans-serif" },
  { family: "Fira Sans", category: "sans-serif" },
  { family: "IBM Plex Sans", category: "sans-serif" },
  { family: "Red Hat Display", category: "sans-serif" },
  { family: "Overpass", category: "sans-serif" },
  { family: "Josefin Sans", category: "sans-serif" },
  { family: "Exo 2", category: "sans-serif" },
  { family: "Nunito Sans", category: "sans-serif" },
  { family: "Dosis", category: "sans-serif" },
  { family: "Commissioner", category: "sans-serif" },
  { family: "Epilogue", category: "sans-serif" },
  { family: "Libre Franklin", category: "sans-serif" },
  { family: "Albert Sans", category: "sans-serif" },
  { family: "Asap", category: "sans-serif" },
  { family: "Hind", category: "sans-serif" },
  { family: "Noto Sans", category: "sans-serif" },
  { family: "PT Sans", category: "sans-serif" },
  { family: "Oxygen", category: "sans-serif" },
  { family: "Titillium Web", category: "sans-serif" },
  { family: "Varela Round", category: "sans-serif" },
  { family: "Kanit", category: "sans-serif" },
  { family: "Be Vietnam Pro", category: "sans-serif" },
  { family: "Wix Madefor Display", category: "sans-serif" },
  { family: "Instrument Sans", category: "sans-serif" },
  { family: "Bricolage Grotesque", category: "sans-serif" },

  // ── Serif ────────────────────────────────────────────────────────────────────
  { family: "Playfair Display", category: "serif" },
  { family: "Merriweather", category: "serif" },
  { family: "Lora", category: "serif" },
  { family: "PT Serif", category: "serif" },
  { family: "EB Garamond", category: "serif" },
  { family: "Libre Baskerville", category: "serif" },
  { family: "Crimson Pro", category: "serif" },
  { family: "Spectral", category: "serif" },
  { family: "Noto Serif", category: "serif" },
  { family: "Bitter", category: "serif" },
  { family: "Source Serif 4", category: "serif" },
  { family: "DM Serif Display", category: "serif" },
  { family: "Fraunces", category: "serif" },
  { family: "Cormorant Garamond", category: "serif" },
  { family: "Young Serif", category: "serif" },
  { family: "Cardo", category: "serif" },
  { family: "Vollkorn", category: "serif" },
  { family: "Arvo", category: "serif" },
  { family: "Zilla Slab", category: "serif" },
  { family: "Roboto Slab", category: "serif" },

  // ── Monospace ────────────────────────────────────────────────────────────────
  { family: "Fira Code", category: "monospace" },
  { family: "Source Code Pro", category: "monospace" },
  { family: "Inconsolata", category: "monospace" },
  { family: "Roboto Mono", category: "monospace" },
  { family: "Space Mono", category: "monospace" },
  { family: "IBM Plex Mono", category: "monospace" },
  { family: "Courier Prime", category: "monospace" },
  { family: "Anonymous Pro", category: "monospace" },
  { family: "Overpass Mono", category: "monospace" },
  { family: "Share Tech Mono", category: "monospace" },
  { family: "DM Mono", category: "monospace" },
  { family: "Azeret Mono", category: "monospace" },
  { family: "Noto Sans Mono", category: "monospace" },
  { family: "Martian Mono", category: "monospace" },
  { family: "Sometype Mono", category: "monospace" },
  { family: "Chivo Mono", category: "monospace" },
  { family: "Fragment Mono", category: "monospace" },
  { family: "Ubuntu Mono", category: "monospace" },
  { family: "Cousine", category: "monospace" },
  { family: "Red Hat Mono", category: "monospace" },

  // ── Display ──────────────────────────────────────────────────────────────────
  { family: "Oswald", category: "display" },
  { family: "Bebas Neue", category: "display" },
  { family: "Anton", category: "display" },
  { family: "Russo One", category: "display" },
  { family: "Righteous", category: "display" },
  { family: "Abril Fatface", category: "display" },
  { family: "Bangers", category: "display" },
  { family: "Black Ops One", category: "display" },
  { family: "Permanent Marker", category: "display" },
  { family: "Lobster", category: "display" },

  // ── Handwriting ──────────────────────────────────────────────────────────────
  { family: "Caveat", category: "handwriting" },
  { family: "Dancing Script", category: "handwriting" },
  { family: "Patrick Hand", category: "handwriting" },
  { family: "Indie Flower", category: "handwriting" },
  { family: "Kalam", category: "handwriting" },
  { family: "Pacifico", category: "handwriting" },
  { family: "Sacramento", category: "handwriting" },
  { family: "Satisfy", category: "handwriting" },
]

export const GOOGLE_FONT_CATEGORIES: {
  id: GoogleFontCategory | "all"
  label: string
}[] = [
  { id: "all", label: "All" },
  { id: "sans-serif", label: "Sans Serif" },
  { id: "serif", label: "Serif" },
  { id: "monospace", label: "Monospace" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Handwriting" },
]

const CSS_FALLBACK: Record<GoogleFontCategory, string> = {
  "sans-serif": "sans-serif",
  serif: "serif",
  monospace: "monospace",
  display: "sans-serif",
  handwriting: "cursive",
}

export function googleFontFamilyValue(family: string): string {
  const font = GOOGLE_FONTS.find((f) => f.family === family)
  const fallback = CSS_FALLBACK[font?.category ?? "sans-serif"]
  return `"${family}", ${fallback}`
}
