import { Broadcaster } from "./lib/broadcaster.js";

export type SemanticIndexPhase = "chunking" | "embedding" | "idle";

export interface SemanticIndexProgress {
  workspaceId: string;
  phase: SemanticIndexPhase;
  current: number;
  total: number;
  /**
   * Set on the "idle" event that ends a chunking sweep. True only for the
   * first sweep since `start()`/`reindex()` — i.e. the sweep a client should
   * treat as "workspace indexing finished" (worth surfacing to the user),
   * as opposed to the many small incremental sweeps a busy editing session
   * triggers. Omitted on the embedding-phase "idle" event.
   */
  initial?: boolean;
  /** Files actually (re-)chunked during this sweep — 0 means nothing had changed. */
  processed?: number;
}

export const semanticIndexBroadcaster = new Broadcaster<
  [SemanticIndexProgress]
>();
