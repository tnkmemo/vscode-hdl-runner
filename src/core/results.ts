export type StageStatus = "idle" | "running" | "success" | "failed";

export interface StageResult {
  name: string;
  status: StageStatus;
  lastExitCode?: number;
  durationMs?: number;
}

class ResultsStore {
  private stages = new Map<string, StageResult>();

  setRunning(name: string) {
    this.stages.set(name, { name, status: "running" });
  }

  setResult(name: string, code: number, durationMs?: number) {
    this.stages.set(name, {
      name,
      status: code === 0 ? "success" : "failed",
      lastExitCode: code,
      durationMs
    });
  }

  reset(name: string) {
    this.stages.set(name, { name, status: "idle" });
  }

  resetAll(names: string[]) {
    for (const n of names) this.reset(n);
  }

  get(name: string): StageResult | undefined {
    return this.stages.get(name);
  }
}

export const resultsStore = new ResultsStore();