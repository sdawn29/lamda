import { Hono } from "hono";
import { randomUUID } from "crypto";
import type { WebSocket } from "ws";
import {
  sharedAuthStorage,
  readAuthJson,
  writeAuthJson,
  activeLogins,
  type OAuthSseEvent,
  type ActiveLogin,
} from "../services/auth-service.js";
import { invalidateModelCache } from "@lamda/pi-sdk";

const auth = new Hono();

// ── OAuth ─────────────────────────────────────────────────────────────────────

auth.get("/auth/oauth/providers", (c) => {
  sharedAuthStorage.reload();
  const providers = sharedAuthStorage.getOAuthProviders().map((p) => {
    const cred = sharedAuthStorage.get(p.id);
    return { id: p.id, name: p.name, loggedIn: cred?.type === "oauth" };
  });
  return c.json({ providers });
});

auth.post("/auth/oauth/:providerId/login", async (c) => {
  const providerId = c.req.param("providerId");
  const loginId = randomUUID();

  const login: ActiveLogin = {
    sseQueue: [],
    sseFlush: null,
    promptResolvers: new Map(),
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

  sharedAuthStorage
    .login(providerId, {
      signal: login.abortController.signal,
      onAuth: (info) =>
        emit({ type: "auth_url", url: info.url, instructions: info.instructions }),
      onProgress: (message) => emit({ type: "progress", message }),
      onPrompt: (prompt) => {
        const promptId = randomUUID();
        emit({ type: "prompt", promptId, message: prompt.message, placeholder: prompt.placeholder });
        return new Promise<string>((resolve) => {
          login.promptResolvers.set(promptId, resolve);
        });
      },
      onManualCodeInput: () => manualInputPromise,
    })
    .then(() => {
      invalidateModelCache();
      emit({ type: "done" });
      activeLogins.delete(loginId);
    })
    .catch((err: unknown) => {
      if (!login.abortController.signal.aborted) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      activeLogins.delete(loginId);
    });

  return c.json({ loginId }, 201);
});

auth.post("/auth/oauth/:loginId/respond", async (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);

  const body = await c.req
    .json<{ promptId?: string; value?: string }>()
    .catch((): { promptId?: string; value?: string } => ({}));
  if (!body.promptId) return c.json({ error: "promptId is required" }, 400);

  const resolver = login.promptResolvers.get(body.promptId);
  if (!resolver) return c.json({ error: "Prompt not found" }, 404);

  login.promptResolvers.delete(body.promptId);
  resolver(body.value ?? "");
  return c.json({ ok: true });
});

auth.post("/auth/oauth/:loginId/abort", (c) => {
  const loginId = c.req.param("loginId");
  const login = activeLogins.get(loginId);
  if (!login) return c.json({ error: "Login session not found" }, 404);
  login.abortController.abort();
  login.rejectManualInput?.(new Error("Login aborted"));
  activeLogins.delete(loginId);
  return c.json({ ok: true });
});

auth.delete("/auth/oauth/:providerId", (c) => {
  const providerId = c.req.param("providerId");
  sharedAuthStorage.reload();
  sharedAuthStorage.logout(providerId);
  invalidateModelCache();
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
  const body = await c.req
    .json<{ providers?: Record<string, string> }>()
    .catch((): { providers?: Record<string, string> } => ({}));
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
  invalidateModelCache();
  return c.json({ ok: true });
});

export function handleOAuthEventsWs(ws: WebSocket, loginId: string) {
  const login = activeLogins.get(loginId);
  if (!login) {
    ws.send(JSON.stringify({ type: "error", message: "Login session not found" }));
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
