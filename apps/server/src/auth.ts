import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret gate for the local server.
 *
 * The server listens on 127.0.0.1 but, without authentication, any web page the
 * user visits in a normal browser could reach it (wildcard CORS / cross-site
 * WebSocket hijacking) and drive the entire API — read arbitrary files, spawn a
 * shell, exfiltrate provider API keys, etc. To close that, every HTTP request
 * and WebSocket upgrade must present a per-launch bearer token.
 *
 * The token is supplied via the `LAMDA_AUTH_TOKEN` env var, which the Electron
 * main process generates on each launch and passes to the spawned server. When
 * the var is unset (e.g. running `npm run dev -w server` bare for debugging),
 * auth is disabled — the shipped desktop app always sets it, so the real attack
 * surface stays protected.
 */
const AUTH_TOKEN = process.env.LAMDA_AUTH_TOKEN?.trim() || null;

export function isAuthEnabled(): boolean {
  return AUTH_TOKEN !== null;
}

/** Constant-time comparison of a presented token against the configured one. */
export function isValidToken(provided: string | null | undefined): boolean {
  if (!AUTH_TOKEN) return true; // auth disabled — nothing to check against
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(AUTH_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Whether a browser `Origin` is permitted. The Origin header is set by the
 * browser and cannot be forged by a remote page, so allowing only localhost
 * origins (plus the no-Origin case used by file:// renderers and native
 * WebSocket clients) blocks cross-site requests from arbitrary websites. The
 * token remains the primary gate; this is defense-in-depth.
 */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  // No/'null' Origin: same-origin requests, the packaged file:// renderer, and
  // non-browser clients. The token still gates access in these cases.
  // Chromium serializes a file:// page's origin as "null" for fetch/XHR but
  // sends the literal "file://" on WebSocket upgrades — allow both, otherwise
  // the packaged renderer's event streams are destroyed at upgrade.
  if (!origin || origin === "null" || origin === "file://") return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

interface TokenCarrier {
  header: (name: string) => string | undefined;
  query: (name: string) => string | undefined;
}

/**
 * Pulls the token from an `Authorization: Bearer <t>` header (fetch/XHR) or a
 * `?token=<t>` query param. The query param fallback exists because browser
 * WebSockets and `<img>`/media element loads cannot set request headers.
 */
export function extractToken(req: TokenCarrier): string | null {
  const auth = req.header("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.query("token") ?? null;
}
