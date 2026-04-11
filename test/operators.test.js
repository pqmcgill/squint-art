import { describe, test, expect } from "bun:test";
import {
  clamp, createRandomPolygon, clonePolygon, cloneIndividual,
  createIndividual, crossover, mutate, tournamentSelect, polyFill,
} from "../src/ga/operators.js";

describe("clamp", () => {
  test("returns value when within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test("clamps to min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  test("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe("createRandomPolygon", () => {
  const poly = createRandomPolygon(6);

  test("has correct number of vertices", () => {
    expect(poly.points).toHaveLength(6);
  });

  test("all points are in [0, 1]", () => {
    for (const pt of poly.points) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(1);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  test("color channels are valid integers in [0, 255]", () => {
    expect(Number.isInteger(poly.r)).toBe(true);
    expect(Number.isInteger(poly.g)).toBe(true);
    expect(Number.isInteger(poly.b)).toBe(true);
    expect(poly.r).toBeGreaterThanOrEqual(0);
    expect(poly.r).toBeLessThanOrEqual(255);
  });

  test("alpha is in (0, 1]", () => {
    expect(poly.a).toBeGreaterThan(0);
    expect(poly.a).toBeLessThanOrEqual(1);
  });

  test("has a fill string", () => {
    expect(poly.fill).toMatch(/^rgba\(/);
  });

  test("works with different vertex counts", () => {
    expect(createRandomPolygon(3).points).toHaveLength(3);
    expect(createRandomPolygon(10).points).toHaveLength(10);
  });
});

describe("clonePolygon", () => {
  test("produces a deep copy — mutating clone does not affect original", () => {
    const original = createRandomPolygon(4);
    const clone = clonePolygon(original);

    // Mutate the clone
    clone.points[0].x = 999;
    clone.r = 999;

    expect(original.points[0].x).not.toBe(999);
    expect(original.r).not.toBe(999);
  });

  test("preserves all properties", () => {
    const original = createRandomPolygon(5);
    const clone = clonePolygon(original);

    expect(clone.r).toBe(original.r);
    expect(clone.g).toBe(original.g);
    expect(clone.b).toBe(original.b);
    expect(clone.a).toBe(original.a);
    expect(clone.fill).toBe(original.fill);
    expect(clone.points).toHaveLength(original.points.length);
  });
});

describe("cloneIndividual", () => {
  test("deep copies — mutating clone does not affect original", () => {
    const original = createIndividual(5, 4);
    const clone = cloneIndividual(original);

    clone.polygons[0].r = 999;
    clone.polygons.push(createRandomPolygon(4));

    expect(original.polygons[0].r).not.toBe(999);
    expect(original.polygons).toHaveLength(5);
  });
});

describe("crossover", () => {
  test("child has same polygon count as parents", () => {
    const p1 = createIndividual(10, 4);
    const p2 = createIndividual(10, 4);
    const child = crossover(p1, p2);

    expect(child.polygons).toHaveLength(10);
  });

  test("child polygons come from one of the two parents", () => {
    // Give parents distinctive colors to verify sourcing
    const p1 = createIndividual(20, 4);
    const p2 = createIndividual(20, 4);
    p1.polygons.forEach((p) => { p.r = 0; polyFill(p); });
    p2.polygons.forEach((p) => { p.r = 255; polyFill(p); });

    const child = crossover(p1, p2);
    for (const poly of child.polygons) {
      expect(poly.r === 0 || poly.r === 255).toBe(true);
    }
  });

  test("child is independent of parents (deep copy)", () => {
    const p1 = createIndividual(5, 4);
    const p2 = createIndividual(5, 4);
    const child = crossover(p1, p2);

    child.polygons[0].points[0].x = 999;
    expect(p1.polygons[0].points[0].x).not.toBe(999);
    expect(p2.polygons[0].points[0].x).not.toBe(999);
  });
});

describe("mutate", () => {
  test("does not corrupt polygon structure after many mutations", () => {
    const ind = createIndividual(20, 6);

    // Run 100 rounds of aggressive mutation
    for (let i = 0; i < 100; i++) {
      mutate(ind, 0.5, 6);
    }

    expect(ind.polygons).toHaveLength(20);
    for (const poly of ind.polygons) {
      expect(poly.points).toHaveLength(6);
      for (const pt of poly.points) {
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }
      expect(poly.r).toBeGreaterThanOrEqual(0);
      expect(poly.r).toBeLessThanOrEqual(255);
      expect(poly.g).toBeGreaterThanOrEqual(0);
      expect(poly.g).toBeLessThanOrEqual(255);
      expect(poly.b).toBeGreaterThanOrEqual(0);
      expect(poly.b).toBeLessThanOrEqual(255);
      expect(poly.a).toBeGreaterThanOrEqual(0.01);
      expect(poly.a).toBeLessThanOrEqual(1);
      expect(poly.fill).toMatch(/^rgba\(/);
    }
  });

  test("with mutation rate 0, individual is unchanged", () => {
    const ind = createIndividual(5, 4);
    const before = JSON.stringify(ind);
    mutate(ind, 0, 4);
    expect(JSON.stringify(ind)).toBe(before);
  });
});

describe("tournamentSelect", () => {
  test("consistently selects fitter individuals", () => {
    // Population where individual 0 is clearly the best
    const pop = Array.from({ length: 10 }, () => createIndividual(3, 3));
    const fit = [1, 100, 200, 300, 400, 500, 600, 700, 800, 900];

    let bestWins = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const selected = tournamentSelect(pop, fit, 3);
      if (selected === pop[0]) bestWins++;
    }

    // The best individual (fitness=1) should win way more than random (10%)
    expect(bestWins / trials).toBeGreaterThan(0.2);
  });

  test("returns an element from the population", () => {
    const pop = [createIndividual(2, 3), createIndividual(2, 3)];
    const fit = [10, 20];
    const result = tournamentSelect(pop, fit, 2);
    expect(pop.includes(result)).toBe(true);
  });
});
