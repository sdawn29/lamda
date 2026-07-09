import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

export const WEB_FETCH_TOOL_NAME = "web_fetch";

/** Hard cap on bytes read from the network, whatever the server claims. */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** Max characters of extracted text returned per call; page beyond via `offset`. */
const MAX_CONTENT_CHARS = 40_000;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Hostname of a `web_fetch` call's `url` input, for per-host approval scoping
 * (mirrors how `bash` is scoped per leading command). Null when the URL is
 * malformed — the call will fail validation anyway.
 */
export function webFetchHost(input: Record<string, unknown>): string | null {
  if (typeof input.url !== "string") return null;
  try {
    return new URL(input.url).hostname || null;
  } catch {
    return null;
  }
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    details: {},
  };
}

function fail(message: string) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
    details: {},
  };
}

// ── HTML → text ─────────────────────────────────────────────────────────────
// Dependency-free reduction of an HTML document to markdown-ish plain text:
// enough structure (headings, lists, links) for the model to navigate, without
// pulling a parser into the server bundle.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(
      /&([a-z]+);/gi,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

export function htmlToText(html: string): { title: string | null; text: string } {
  const title =
    /<title[^>]*>([\s\S]*?)<\/title>/i
      .exec(html)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() || null;

  let s = html
    // Invisible / non-content subtrees go first so their text never leaks.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    // Links keep their destination: <a href="u">t</a> → [t](u).
    .replace(
      /<a\b[^>]*href=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a\s*>/gi,
      (_, href: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (!text) return "";
        return href.startsWith("#") ? text : `[${text}](${href})`;
      },
    )
    // Structural tags become line breaks / markers before all tags are dropped.
    .replace(
      /<h([1-6])[^>]*>/gi,
      (_, level: string) => `\n\n${"#".repeat(Number(level))} `,
    )
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|tr|ul|ol|table|blockquote)\s*>/gi, "\n\n")
    .replace(/<td[^>]*>|<th[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, "");

  s = decodeEntities(s)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text: s };
}

/** Read up to `MAX_RESPONSE_BYTES` of a response body, then stop pulling. */
async function readBodyCapped(
  res: Response,
): Promise<{ body: string; capped: boolean }> {
  if (!res.body) return { body: await res.text(), capped: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let capped = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (received >= MAX_RESPONSE_BYTES) {
      capped = true;
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(merged), capped };
}

/**
 * Tool that fetches a URL and returns its content as text — HTML is reduced to
 * markdown-ish plain text, everything else (JSON, plain text, …) is returned
 * as-is. Output is truncated to a fixed budget; `offset` pages through longer
 * documents. Gated per-host by the tool-approval bridge.
 */
export function createWebFetchTool(): ToolDefinition {
  return {
    name: WEB_FETCH_TOOL_NAME,
    label: "fetch web page",
    description: `Fetch a URL over HTTP(S) and return its content as text. HTML pages are converted to readable plain text with markdown headings, lists, and links; JSON and plain-text responses are returned verbatim.

Use this to read documentation, articles, API responses, or any other web resource the user points you at.

Notes:
- Output longer than ${MAX_CONTENT_CHARS.toLocaleString("en-US")} characters is truncated; the result says so and reports the total length. Pass \`offset\` to continue reading from that character position.
- Binary responses (images, PDFs, archives) are not supported.`,
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description: "The http(s) URL to fetch.",
        },
        offset: {
          type: "number",
          description:
            "Character offset into the extracted text to start from, for paging through long documents. Defaults to 0.",
        },
      },
    },
    execute: async (_toolCallId, params) => {
      const p = (params ?? {}) as Record<string, unknown>;
      const rawUrl = typeof p.url === "string" ? p.url.trim() : "";
      if (!rawUrl) return fail("`url` is required.");

      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return fail(`"${rawUrl}" is not a valid URL.`);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return fail("Only http:// and https:// URLs can be fetched.");
      }

      const offset =
        typeof p.offset === "number" && Number.isFinite(p.offset) && p.offset > 0
          ? Math.floor(p.offset)
          : 0;

      let res: Response;
      try {
        res = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
            "User-Agent": "lamda-agent/1.0 (+https://github.com/lamda)",
            Accept:
              "text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8",
          },
        });
      } catch (err) {
        const message =
          err instanceof Error && err.name === "TimeoutError"
            ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`
            : err instanceof Error
              ? err.message
              : String(err);
        return fail(`Failed to fetch ${url.href}: ${message}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
      const isText =
        mime.startsWith("text/") ||
        mime.includes("json") ||
        mime.includes("xml") ||
        mime.includes("javascript") ||
        mime === "";
      if (!isText) {
        return fail(
          `Unsupported content type "${mime}" — only text-based responses can be fetched.`,
        );
      }

      let body: string;
      let capped: boolean;
      try {
        ({ body, capped } = await readBodyCapped(res));
      } catch (err) {
        return fail(
          `Failed to read response body: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      let title: string | null = null;
      let text = body;
      if (mime === "text/html" || mime === "application/xhtml+xml") {
        ({ title, text } = htmlToText(body));
      }

      const slice = text.slice(offset, offset + MAX_CONTENT_CHARS);
      const truncated = capped || offset + slice.length < text.length;

      return ok({
        url: url.href,
        ...(res.url && res.url !== url.href ? { finalUrl: res.url } : {}),
        status: res.status,
        contentType: mime,
        ...(title ? { title } : {}),
        content: slice,
        totalLength: text.length,
        ...(offset > 0 ? { offset } : {}),
        truncated,
        ...(truncated
          ? {
              note: `Content truncated; showing characters ${offset}–${offset + slice.length} of ${text.length}${capped ? " (response capped at 2 MB)" : ""}. Call again with offset=${offset + slice.length} to continue.`,
            }
          : {}),
      });
    },
  };
}
