import { describe, expect, test } from "bun:test";
import { createAdaptiveMutation } from "../src/ga/adaptive-mutation.js";

describe("adaptive mutation", () => {
  test("starts at the initial rate", () => {
    const am = createAdaptiveMutation(0.03);
    expect(am.rate).toBe(0.03);
  });

  test("does not change rate before the window elapses", () => {
    const am = createAdaptiveMutation(0.03, { window: 10 });
    for (let i = 0; i < 9; i++) am.update(100);
    expect(am.rate).toBe(0.03);
  });

  test("cools when fitness improves", () => {
    const am = createAdaptiveMutation(0.03, { window: 5, coolFactor: 0.5 });
    // First window: establish baseline
    for (let i = 0; i < 5; i++) am.update(100);
    // Second window: better fitness
    for (let i = 0; i < 5; i++) am.update(80);
    expect(am.rate).toBe(0.03 * 0.5);
  });

  test("heats when fitness stalls", () => {
    const am = createAdaptiveMutation(0.03, { window: 5, heatFactor: 2.0 });
    // First window: establish baseline
    for (let i = 0; i < 5; i++) am.update(100);
    // Second window: no improvement
    for (let i = 0; i < 5; i++) am.update(100);
    expect(am.rate).toBe(0.03 * 2.0);
  });

  test("heats when fitness worsens", () => {
    const am = createAdaptiveMutation(0.03, { window: 5, heatFactor: 2.0 });
    for (let i = 0; i < 5; i++) am.update(100);
    for (let i = 0; i < 5; i++) am.update(120);
    expect(am.rate).toBe(0.03 * 2.0);
  });

  test("does not cool below min", () => {
    const am = createAdaptiveMutation(0.01, {
      window: 1,
      coolFactor: 0.1,
      min: 0.005,
    });
    am.update(100); // establish baseline
    am.update(50); // improve → cool
    expect(am.rate).toBe(0.005);
  });

  test("does not heat above max", () => {
    const am = createAdaptiveMutation(0.1, {
      window: 1,
      heatFactor: 10.0,
      max: 0.15,
    });
    am.update(100); // establish baseline
    am.update(100); // stall → heat
    expect(am.rate).toBe(0.15);
  });

  test("oscillates over multiple windows", () => {
    const am = createAdaptiveMutation(0.03, { window: 3 });

    // Stall for several windows → rate should climb
    for (let w = 0; w < 4; w++) {
      for (let i = 0; i < 3; i++) am.update(100);
    }
    expect(am.rate).toBeGreaterThan(0.03);

    const heatedRate = am.rate;

    // Now improve for several windows → rate should drop
    let fitness = 100;
    for (let w = 0; w < 4; w++) {
      fitness -= 5;
      for (let i = 0; i < 3; i++) am.update(fitness);
    }
    expect(am.rate).toBeLessThan(heatedRate);
  });

  test("reset restores initial state", () => {
    const am = createAdaptiveMutation(0.03, { window: 1 });
    am.update(100);
    am.update(100); // stall → heat
    expect(am.rate).not.toBe(0.03);

    am.reset(0.05);
    expect(am.rate).toBe(0.05);
  });
});
