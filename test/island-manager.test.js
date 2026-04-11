import { describe, test, expect, beforeEach } from "bun:test";
import { IslandManager } from "../src/ga/island-manager.js";

// We can't spawn real Web Workers in bun test, but we can test
// the state machine logic (pause/resume/kill transitions).

describe("IslandManager state", () => {
  let mgr;

  beforeEach(() => {
    mgr = new IslandManager();
  });

  test("starts with no islands and not paused", () => {
    expect(mgr.numIslands).toBe(0);
    expect(mgr.paused).toBe(false);
    expect(mgr.globalBest).toBeNull();
  });

  test("kill resets paused state", () => {
    mgr._paused = true;
    mgr.kill();
    expect(mgr.paused).toBe(false);
  });

  test("pause sets paused flag", () => {
    // Simulate having workers (stubs that accept postMessage)
    mgr.workers = [
      { postMessage() {}, terminate() {} },
      { postMessage() {}, terminate() {} },
    ];
    mgr.pause();
    expect(mgr.paused).toBe(true);
  });

  test("resume clears paused flag", () => {
    mgr.workers = [
      { postMessage() {}, terminate() {} },
    ];
    mgr._paused = true;
    mgr.resume("ring");
    expect(mgr.paused).toBe(false);
  });

  test("resume is a no-op when not paused", () => {
    mgr.workers = [{ postMessage() {}, terminate() {} }];
    mgr._paused = false;
    mgr.resume("ring"); // should not throw
    expect(mgr.paused).toBe(false);
  });

  test("resume is a no-op with no workers", () => {
    mgr._paused = true;
    mgr.resume("ring");
    // Still paused because there are no workers to resume
    expect(mgr.paused).toBe(true);
  });

  test("pause sends stop to all workers", () => {
    const messages = [];
    mgr.workers = [
      { postMessage(m) { messages.push(m); }, terminate() {} },
      { postMessage(m) { messages.push(m); }, terminate() {} },
    ];
    mgr.pause();
    expect(messages).toEqual([{ type: "stop" }, { type: "stop" }]);
  });

  test("resume sends resume to all workers", () => {
    const messages = [];
    mgr.workers = [
      { postMessage(m) { messages.push(m); }, terminate() {} },
    ];
    mgr._paused = true;
    mgr.resume("ring");
    expect(messages).toEqual([{ type: "resume" }]);
  });

  test("totalGenerations sums across island states", () => {
    mgr.islandState = [
      { generation: 100 },
      null,
      { generation: 200 },
    ];
    expect(mgr.totalGenerations()).toBe(300);
  });
});
