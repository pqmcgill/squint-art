import { describe, test, expect } from "bun:test";
import { BenchmarkData } from "../src/chart/data.js";

describe("BenchmarkData", () => {
  test("starts with no runs", () => {
    const bd = new BenchmarkData();
    expect(bd.runs).toHaveLength(0);
    expect(bd.activeRun).toBeNull();
  });

  test("startRun creates a new run with config", () => {
    const bd = new BenchmarkData();
    bd.startRun({ polygons: 50, pop: 100 });

    expect(bd.runs).toHaveLength(1);
    expect(bd.activeRun).not.toBeNull();
    expect(bd.activeRun.config.polygons).toBe(50);
    expect(bd.activeRun.label).toBe("Run 1");
  });

  test("record adds points to the active run", () => {
    const bd = new BenchmarkData();
    bd.startRun({ polygons: 50 });
    bd.record(100, 95.5);
    bd.record(200, 96.1);

    expect(bd.activeRun.points).toHaveLength(2);
    expect(bd.activeRun.points[0].gen).toBe(100);
    expect(bd.activeRun.points[0].similarity).toBe(95.5);
    expect(bd.activeRun.points[1].gen).toBe(200);
  });

  test("record is a no-op when no active run", () => {
    const bd = new BenchmarkData();
    bd.record(100, 95); // should not throw
    expect(bd.runs).toHaveLength(0);
  });

  test("stopRun clears active run but preserves data", () => {
    const bd = new BenchmarkData();
    bd.startRun({ polygons: 50 });
    bd.record(100, 95);
    bd.stopRun();

    expect(bd.activeRun).toBeNull();
    expect(bd.runs).toHaveLength(1);
    expect(bd.runs[0].points).toHaveLength(1);
  });

  test("multiple runs are tracked independently", () => {
    const bd = new BenchmarkData();
    bd.startRun({ id: 1 });
    bd.record(100, 90);
    bd.stopRun();

    bd.startRun({ id: 2 });
    bd.record(50, 85);
    bd.stopRun();

    expect(bd.runs).toHaveLength(2);
    expect(bd.runs[0].label).toBe("Run 1");
    expect(bd.runs[1].label).toBe("Run 2");
    expect(bd.runs[0].points[0].gen).toBe(100);
    expect(bd.runs[1].points[0].gen).toBe(50);
  });

  test("clearRuns resets everything", () => {
    const bd = new BenchmarkData();
    bd.startRun({ x: 1 });
    bd.record(10, 80);
    bd.clearRuns();

    expect(bd.runs).toHaveLength(0);
    expect(bd.activeRun).toBeNull();
  });

  test("exportData returns valid JSON with correct structure", () => {
    const bd = new BenchmarkData();
    bd.startRun({ polygons: 50 });
    bd.record(100, 95);
    bd.stopRun();

    const json = bd.exportData();
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("Run 1");
    expect(parsed[0].config.polygons).toBe(50);
    expect(parsed[0].points).toHaveLength(1);
    expect(parsed[0].points[0].gen).toBe(100);
    expect(parsed[0].points[0].similarity).toBe(95);
    expect(parsed[0].points[0].time).toBeGreaterThanOrEqual(0);
  });

  test("config is a snapshot — mutating the original does not affect stored config", () => {
    const bd = new BenchmarkData();
    const cfg = { polygons: 50 };
    bd.startRun(cfg);
    cfg.polygons = 999;

    expect(bd.activeRun.config.polygons).toBe(50);
  });
});
