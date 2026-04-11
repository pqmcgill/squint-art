// Pure benchmark data collection — no DOM dependency.

export class BenchmarkData {
  constructor() {
    this.runs = [];
    this.activeRun = null;
  }

  startRun(config) {
    this.activeRun = {
      label: `Run ${this.runs.length + 1}`,
      config: { ...config },
      t0: performance.now(),
      points: [],
    };
    this.runs.push(this.activeRun);
  }

  record(generation, similarity) {
    if (!this.activeRun) return;
    this.activeRun.points.push({
      gen: generation,
      similarity,
      time: (performance.now() - this.activeRun.t0) / 1000,
    });
  }

  stopRun() {
    this.activeRun = null;
  }

  clearRuns() {
    this.runs = [];
    this.activeRun = null;
  }

  exportData() {
    return JSON.stringify(
      this.runs.map((r) => ({
        label: r.label,
        config: r.config,
        points: r.points,
      })),
      null,
      2,
    );
  }
}
