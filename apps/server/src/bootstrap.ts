import { createManagedSession, openManagedSession } from "@lambda/pi-sdk";
import { listWorkspacesWithThreads } from "@lambda/db";
import { store } from "./store.js";

/**
 * Recreate Pi sessions for every persisted thread on server startup.
 * Threads with a saved session_file are resumed (context restored);
 * threads without one get a fresh session.
 * Individual failures are logged but non-fatal — other sessions still work.
 */
export async function bootstrapSessions(): Promise<void> {
  const workspaceList = listWorkspacesWithThreads();

  const tasks = workspaceList.flatMap((ws) =>
    ws.threads.map(async (thread) => {
      const handle = thread.sessionFile
        ? await openManagedSession(thread.sessionFile, { cwd: ws.path })
        : await createManagedSession({ cwd: ws.path });
      store.create(handle, ws.path, thread.id);
    }),
  );

  const results = await Promise.allSettled(tasks);

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[bootstrap] session ${i} failed:`, r.reason);
    }
  });

  const total = results.length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (total > 0) {
    console.error(`[bootstrap] restored ${total - failed}/${total} sessions`);
  }
}
