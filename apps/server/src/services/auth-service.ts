import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { AuthStorage } from "@earendil-works/pi-coding-agent";

export const sharedAuthStorage = AuthStorage.create();

export const AUTH_FILE = join(homedir(), ".pi", "agent", "auth.json");

export type AuthEntry = { type: string; key?: string; [k: string]: unknown };
export type AuthJson = Record<string, AuthEntry>;

export async function readAuthJson(): Promise<AuthJson> {
  if (!existsSync(AUTH_FILE)) return {};
  try {
    const raw = await readFile(AUTH_FILE, "utf-8");
    return JSON.parse(raw) as AuthJson;
  } catch {
    return {};
  }
}

export async function writeAuthJson(data: AuthJson): Promise<void> {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export type OAuthSseEvent =
  | { type: "auth_url"; url: string; instructions?: string }
  | { type: "prompt"; promptId: string; message: string; placeholder?: string }
  | { type: "progress"; message: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface ActiveLogin {
  sseQueue: OAuthSseEvent[];
  sseFlush: (() => void) | null;
  promptResolvers: Map<string, (value: string) => void>;
  abortController: AbortController;
  rejectManualInput: ((err: Error) => void) | null;
  createdAt: number;
}

export const activeLogins = new Map<string, ActiveLogin>();

// Sweep abandoned OAuth logins that were never completed or aborted.
const LOGIN_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, login] of activeLogins) {
    if (now - login.createdAt > LOGIN_TTL_MS) {
      login.abortController.abort();
      activeLogins.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();
