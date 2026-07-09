interface QueuedTask<T> {
  label: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

interface QueueState {
  active: boolean;
  tasks: QueuedTask<unknown>[];
}

export interface BackgroundQueueStats {
  lane: string;
  active: boolean;
  pending: number;
}

/**
 * Small in-process FIFO queue for background work that should not compete for
 * the same synchronous SQLite connection. Lanes are independent; tasks within a
 * lane run one at a time.
 */
class BackgroundTaskQueue {
  private lanes = new Map<string, QueueState>();

  enqueue<T>(lane: string, label: string, run: () => Promise<T>): Promise<T> {
    const state = this.getLane(lane);
    return new Promise<T>((resolve, reject) => {
      state.tasks.push({
        label,
        run,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain(lane, state);
    });
  }

  stats(): BackgroundQueueStats[] {
    return Array.from(this.lanes.entries()).map(([lane, state]) => ({
      lane,
      active: state.active,
      pending: state.tasks.length,
    }));
  }

  private getLane(lane: string): QueueState {
    let state = this.lanes.get(lane);
    if (!state) {
      state = { active: false, tasks: [] };
      this.lanes.set(lane, state);
    }
    return state;
  }

  private drain(lane: string, state: QueueState): void {
    if (state.active) return;
    const task = state.tasks.shift();
    if (!task) return;

    state.active = true;
    void (async () => {
      try {
        task.resolve(await task.run());
      } catch (err) {
        console.error(`[background-queue] ${lane}:${task.label} failed`, err);
        task.reject(err);
      } finally {
        state.active = false;
        this.drain(lane, state);
      }
    })();
  }
}

export const backgroundTaskQueue = new BackgroundTaskQueue();
