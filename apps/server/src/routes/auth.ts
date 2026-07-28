import { Hono } from "hono";
import { randomUUID } from "crypto";
import { z } from "zod";
import type { WebSocket } from "ws";
import type { AuthInteraction } from "@earendil-works/pi-ai";
import {
  readAuthJson,
  writeAuthJson,
  activeLogins,
  type OAuthSseEvent,
  type ActiveLogin,
} from "../services/auth-service.js";
import { sharedModelRuntime, resetModelRuntime } from "@lamda/pi-sdk";
import { parseJsonBody } from "../lib/validate.js";

const auth = new Hono();

const oauthRespondSchema = z.object({
  promptId: z.string().optional(),
  value: z.string().optional(),
});

const providersSchema = z.object({
  providers: z.record(z.string(), z.string()).optional(),
});

// ── OAuth ─────────────────────────────────────────────────────────────────────

auth.get("/auth/oauth/providers", async (c) => {
  // The shared runtime is reset (not just refreshed) whenever auth.json is
  // written, so this instance already reflects current credentials.
  const runtime = await sharedModelRuntime();
  const providers = runtime
    .getProviders()
    .filter((p) => p.auth?.oauth)
    .map((p) => ({
      id: p.id,
      name: p.auth!.oauth!.name,
      loggedIn: runtime.isUsingOAuth(p.id),
    }));
  return c.json({ providers });
});

auth.post("/auth/oauth/:providerId/login", async (c) => {
  const providerId = c.req.param("providerId");
  const loginId = randomUUID();

  const login: ActiveLogin = {
    sseQueue: [],
    sseFlush: null,
    promptResolvers: new Map(),
    selectResolvers: new Map(),
    abortController: new AbortController(),
    rejectManualInput: null,
    createdAt: Date.now(),
  };
  activeLogins.set(loginId, login);

  function emit(event: OAuthSseEvent) {
    login.sseQueue.push(event);
    login.sseFlush?.();
  }

  // Rejecting manualInputPromise triggers server.cancelWait() inside the SDK,
  // which closes the local HTTP server on port 1455 (via finally block).
  const manualInputPromise = new Promise<string>((_resolve, reject) => {
    login.rejectManualInput = reject;
  });

  // pi 0.80.8+ unified the old per-event callbacks into a single
  // AuthInteraction: `notify` for one-way events, `prompt` for anything that
  // needs a user response (text/secret/select/manual_code).
  const interaction: AuthInteraction = {
    signal: login.abortController.signal,
    notify: (event) => {
      if (event.type === "auth_url") {
        emit({
          type: "auth_url",
          url: event.url,
          instructions: event.instructions,
        });
      } else if (event.type === "device_code") {
        emit({
          type: "device_code",
          userCode: event.userCode,
          verificationUri: event.verificationUri,
          expiresInSeconds: event.expiresInSeconds,
          intervalSeconds: event.intervalSeconds,
        });
      } else {
        // "progress" and "info" both render as status text in the UI.
        emit({ type: "progress", message: event.message });
      }
    },
    prompt: (prompt) => {
      // The manual paste-the-code fallback is never answered through this API
      // — it races the local callback server and unwinds via abort, which is
      // what closes the SDK's listener on port 1455.
      if (prompt.type === "manual_code") return manualInputPromise;

      const promptId = randomUUID();
      const pending =
        prompt.type === "select"
          ? new Promise<string>((resolve, reject) => {
              emit({
                type: "select",
                promptId,
                message: prompt.message,
                options: prompt.options.map((o) => ({
                  id: o.id,
                  label: o.label,
                })),
              });
              login.selectResolvers.set(promptId, (value) =>
                value === undefined
                  ? reject(new Error("Selection cancelled"))
                  : resolve(value),
              );
            })
          : new Promise<string>((resolve) => {
              emit({
                type: "prompt",
                promptId,
                message: prompt.message,
                placeholder: prompt.placeholder,
              });
              login.promptResolvers.set(promptId, resolve);
            });

      // A per-prompt signal cancels just this step (the whole-flow signal is
      // passed separately above), so drop the resolver and unwind.
      if (!prompt.signal) return pending;
      return Promise.race([
        pending,
        new Promise<string>((_resolve, reject) => {
          prompt.signal!.addEventListener(
            "abort",
            () => {
              login.promptResolvers.delete(promptId);
              login.selectResolvers.delete(promptId);
              reject(new Error("Prompt cancelled"));
            },
            { once: true },
          );
        }),
      ]);
    },
  };

  void sharedModelRuntime()
    .then((runtime) => runtime.login(providerId, "oauth", interaction))
    .then(() => {
      resetModelRuntime();
      emit({ type: "done" });
      activeLogins.delete(loginId);
    })
    .catch((err: unknown) => {
      if (!login.abortController.signal.aborted) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      activeLogins.delete(loginId);
    });

  return c.json({ loginId }, 201);
});

auth.post("/auth/oauth/:loginId/respond", async (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);

  const parsed = await parseJsonBody(c, oauthRespondSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.promptId) return c.json({ error: "promptId is required" }, 400);

  // A pending request is either a free-text prompt or an interactive selector.
  const promptResolver = login.promptResolvers.get(body.promptId);
  if (promptResolver) {
    login.promptResolvers.delete(body.promptId);
    promptResolver(body.value ?? "");
    return c.json({ ok: true });
  }

  const selectResolver = login.selectResolvers.get(body.promptId);
  if (selectResolver) {
    login.selectResolvers.delete(body.promptId);
    // An empty value cancels the selector (resolves to undefined).
    selectResolver(body.value ? body.value : undefined);
    return c.json({ ok: true });
  }

  return c.json({ error: "Prompt not found" }, 404);
});

auth.post("/auth/oauth/:loginId/abort", (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);
  login.abortController.abort();
  login.rejectManualInput?.(new Error("Login aborted"));
  // Cancel any pending interactive selector so the SDK login promise unwinds.
  for (const resolve of login.selectResolvers.values()) resolve(undefined);
  login.selectResolvers.clear();
  activeLogins.delete(loginId);
  return c.json({ ok: true });
});

auth.delete("/auth/oauth/:providerId", async (c) => {
  const providerId = c.req.param("providerId");
  const runtime = await sharedModelRuntime();
  await runtime.logout(providerId);
  resetModelRuntime();
  return c.json({ ok: true });
});

// ── Provider API keys ─────────────────────────────────────────────────────────

auth.get("/providers", async (c) => {
  const authData = await readAuthJson();
  const providers: Record<string, string> = {};
  for (const [id, entry] of Object.entries(authData)) {
    if (entry.type === "api_key" && typeof entry.key === "string") {
      providers[id] = entry.key;
    }
  }
  return c.json({ providers });
});

auth.put("/providers", async (c) => {
  const parsed = await parseJsonBody(c, providersSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.providers) return c.json({ error: "providers is required" }, 400);

  const authData = await readAuthJson();
  for (const [id, key] of Object.entries(body.providers)) {
    if (key.trim() === "") {
      // Remove api_key entries; keep OAuth and other types untouched
      if (authData[id]?.type === "api_key") delete authData[id];
    } else {
      authData[id] = { type: "api_key", key: key.trim() };
    }
  }

  await writeAuthJson(authData);
  resetModelRuntime();
  return c.json({ ok: true });
});

export function handleOAuthEventsWs(ws: WebSocket, loginId: string) {
  const login = activeLogins.get(loginId);
  if (!login) {
    ws.send(
      JSON.stringify({ type: "error", message: "Login session not found" }),
    );
    ws.close();
    return;
  }

  const flush = () => {
    while (login.sseQueue.length > 0) {
      const event = login.sseQueue.shift()!;
      if (ws.readyState !== 1 /* OPEN */) break;
      ws.send(JSON.stringify(event));
      if (event.type === "done" || event.type === "error") {
        login.sseFlush = null;
        ws.close();
        return;
      }
    }
  };

  // Drain any already-queued events
  flush();

  login.sseFlush = flush;

  ws.on("close", () => {
    if (login.sseFlush === flush) login.sseFlush = null;
  });
}

export default auth;
