import type {
  AgentSession,
  AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { SessionEvent } from "./types.js";

/**
 * Returns an async generator that yields all AgentSessionEvents from the session.
 *
 * The generator stays alive across multiple prompt() calls — it only ends when the
 * caller breaks out of the for-await loop (which unsubscribes and cleans up).
 *
 * Node.js is single-threaded, so the queue push and resolve() pattern below is
 * free from races: the subscribe callback can only fire when the generator is
 * suspended at the `await new Promise(...)` line.
 */
export async function* sessionEventGenerator(
  session: AgentSession,
): AsyncGenerator<SessionEvent> {
  const pending: AgentSessionEvent[] = [];
  let waiting: ((value: void) => void) | null = null;
  let closed = false;

  const unsubscribe = session.subscribe((event) => {
    if (closed) return;
    pending.push(event);
    if (waiting) {
      const w = waiting;
      waiting = null;
      w();
    }
  });

  try {
    while (true) {
      if (pending.length > 0) {
        yield pending.shift()!;
      } else if (closed) {
        break;
      } else {
        await new Promise<void>((resolve) => {
          waiting = resolve;
        });
      }
    }
  } finally {
    closed = true;
    unsubscribe();
  }
}
