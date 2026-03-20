import { BenchmarkProgress, BenchmarkRun } from "@/types";

export type ToolActivityEvent =
  | {
      type: "tool";
      payload: {
        modelId: string;
        stage: "generate" | "revise";
        toolName: "search_web";
        state: "started" | "completed" | "failed";
        callId: string;
        query?: string;
        resultCount?: number;
        urls?: string[];
        error?: string;
      };
    };

type RunEvent =
  | { type: "progress"; payload: BenchmarkProgress }
  | { type: "token"; payload: { modelId: string; stage: string; chunk: string } }
  | ToolActivityEvent;

type Listener = (event: RunEvent) => void;

class RunEventBus {
  private listeners = new Map<string, Set<Listener>>();
  private snapshots = new Map<string, BenchmarkRun>();

  subscribe(runId: string, listener: Listener): () => void {
    const set = this.listeners.get(runId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(runId, set);

    const snapshot = this.snapshots.get(runId);
    if (snapshot) {
      listener({
        type: "progress",
        payload: {
          status: snapshot.status,
          step: snapshot.currentStep,
          run: snapshot,
        },
      });
    }

    return () => {
      const listeners = this.listeners.get(runId);
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  publishProgress(progress: BenchmarkProgress) {
    this.snapshots.set(progress.run.id, progress.run);
    this.emit(progress.run.id, { type: "progress", payload: progress });
  }

  publishToken(runId: string, modelId: string, stage: string, chunk: string) {
    this.emit(runId, {
      type: "token",
      payload: { modelId, stage, chunk },
    });
  }

  publishToolActivity(
    runId: string,
    payload: ToolActivityEvent["payload"]
  ) {
    this.emit(runId, {
      type: "tool",
      payload,
    });
  }

  setSnapshot(run: BenchmarkRun) {
    this.snapshots.set(run.id, run);
  }

  private emit(runId: string, event: RunEvent) {
    const listeners = this.listeners.get(runId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __novelBenchEventBus: RunEventBus | undefined;
}

export function getRunEventBus(): RunEventBus {
  if (!globalThis.__novelBenchEventBus) {
    globalThis.__novelBenchEventBus = new RunEventBus();
  }
  return globalThis.__novelBenchEventBus;
}
