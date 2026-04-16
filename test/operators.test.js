import { describe, expect, test } from "bun:test";
import {
  clamp,
  cloneIndividual,
  clonePolygon,
  cloneShape,
  createIndividual,
  createRandomPolygon,
  createRandomShape,
  crossover,
  mutate,
  polyFill,
  tournamentSelect,
} from "../src/ga/operators.js";
import { circleShape, polygonShape } from "../src/ga/shapes.js";

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

describe("createRandomPolygon (back-compat)", () => {
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
});

describe("createRandomShape", () => {
  test("polygon strategy produces points", () => {
    const s = createRandomShape(polygonShape, { numVertices: 5 });
    expect(s.points).toHaveLength(5);
    expect(s.fill).toMatch(/^rgba\(/);
  });

  test("circle strategy produces x/y/radius", () => {
    const s = createRandomShape(circleShape, {});
    expect(typeof s.x).toBe("number");
    expect(typeof s.y).toBe("number");
    expect(typeof s.radius).toBe("number");
    expect(s.points).toBeUndefined();
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThanOrEqual(1);
    expect(s.radius).toBeGreaterThan(0);
    expect(s.fill).toMatch(/^rgba\(/);
  });
});

describe("clonePolygon (back-compat)", () => {
  test("produces a deep copy — mutating clone does not affect original", () => {
    const original = createRandomPolygon(4);
    const clone = clonePolygon(original);

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

describe("cloneShape", () => {
  test("deep-copies a polygon — points array is independent", () => {
    const s = createRandomShape(polygonShape, { numVertices: 4 });
    const c = cloneShape(polygonShape, s);
    c.points[0].x = 999;
    expect(s.points[0].x).not.toBe(999);
  });

  test("deep-copies a circle — all fields independent", () => {
    const s = createRandomShape(circleShape, {});
    const c = cloneShape(circleShape, s);
    c.x = 999;
    c.radius = 999;
    expect(s.x).not.toBe(999);
    expect(s.radius).not.toBe(999);
  });
});

describe("cloneIndividual", () => {
  test("deep copies — mutating clone does not affect original (polygon)", () => {
    const original = createIndividual(polygonShape, 5, { numVertices: 4 });
    const clone = cloneIndividual(polygonShape, original);

    clone.polygons[0].r = 999;
    clone.polygons.push(createRandomShape(polygonShape, { numVertices: 4 }));

    expect(original.polygons[0].r).not.toBe(999);
    expect(original.polygons).toHaveLength(5);
  });

  test("deep copies — circle individuals", () => {
    const original = createIndividual(circleShape, 4, {});
    const clone = cloneIndividual(circleShape, original);

    clone.polygons[0].radius = 999;
    expect(original.polygons[0].radius).not.toBe(999);
  });
});

describe("crossover", () => {
  test("child has same shape count as parents (polygon)", () => {
    const p1 = createIndividual(polygonShape, 10, { numVertices: 4 });
    const p2 = createIndividual(polygonShape, 10, { numVertices: 4 });
    const child = crossover(polygonShape, p1, p2);

    expect(child.polygons).toHaveLength(10);
  });

  test("child shapes come from one of the two parents", () => {
    const p1 = createIndividual(polygonShape, 20, { numVertices: 4 });
    const p2 = createIndividual(polygonShape, 20, { numVertices: 4 });
    p1.polygons.forEach((p) => {
      p.r = 0;
      polyFill(p);
    });
    p2.polygons.forEach((p) => {
      p.r = 255;
      polyFill(p);
    });

    const child = crossover(polygonShape, p1, p2);
    for (const poly of child.polygons) {
      expect(poly.r === 0 || poly.r === 255).toBe(true);
    }
  });

  test("single-point: first half from p1, second half from p2", () => {
    const p1 = createIndividual(polygonShape, 20, { numVertices: 4 });
    const p2 = createIndividual(polygonShape, 20, { numVertices: 4 });
    p1.polygons.forEach((p) => {
      p.r = 0;
      polyFill(p);
    });
    p2.polygons.forEach((p) => {
      p.r = 255;
      polyFill(p);
    });

    for (let trial = 0; trial < 50; trial++) {
      const child = crossover(polygonShape, p1, p2);
      let cutFound = -1;
      for (let i = 1; i < child.polygons.length; i++) {
        if (child.polygons[i].r !== child.polygons[i - 1].r) {
          cutFound = i;
          break;
        }
      }
      if (cutFound !== -1) {
        for (let i = 0; i < cutFound; i++) {
          expect(child.polygons[i].r).toBe(0);
        }
        for (let i = cutFound; i < child.polygons.length; i++) {
          expect(child.polygons[i].r).toBe(255);
        }
      }
    }
  });

  test("child is independent of parents (deep copy)", () => {
    const p1 = createIndividual(polygonShape, 5, { numVertices: 4 });
    const p2 = createIndividual(polygonShape, 5, { numVertices: 4 });
    const child = crossover(polygonShape, p1, p2);

    child.polygons[0].points[0].x = 999;
    expect(p1.polygons[0].points[0].x).not.toBe(999);
    expect(p2.polygons[0].points[0].x).not.toBe(999);
  });

  test("works with circle strategy", () => {
    const p1 = createIndividual(circleShape, 8, {});
    const p2 = createIndividual(circleShape, 8, {});
    const child = crossover(circleShape, p1, p2);
    expect(child.polygons).toHaveLength(8);
    for (const s of child.polygons) {
      expect(typeof s.radius).toBe("number");
    }
  });
});

describe("mutate", () => {
  test("does not corrupt polygon structure after many mutations", () => {
    const ind = createIndividual(polygonShape, 20, { numVertices: 6 });

    for (let i = 0; i < 100; i++) {
      mutate(polygonShape, ind, 0.5, { numVertices: 6 });
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
      expect(poly.a).toBeGreaterThanOrEqual(0.01);
      expect(poly.a).toBeLessThanOrEqual(1);
      expect(poly.fill).toMatch(/^rgba\(/);
    }
  });

  test("does not corrupt circle structure after many mutations", () => {
    const ind = createIndividual(circleShape, 15, {});

    for (let i = 0; i < 100; i++) {
      mutate(circleShape, ind, 0.5, {});
    }

    expect(ind.polygons).toHaveLength(15);
    for (const s of ind.polygons) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(1);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1);
      expect(s.radius).toBeGreaterThan(0);
      expect(s.radius).toBeLessThanOrEqual(0.5);
      expect(s.r).toBeGreaterThanOrEqual(0);
      expect(s.r).toBeLessThanOrEqual(255);
      expect(s.fill).toMatch(/^rgba\(/);
    }
  });

  test("with mutation rate 0, individual is unchanged", () => {
    const ind = createIndividual(polygonShape, 5, { numVertices: 4 });
    const before = JSON.stringify(ind);
    mutate(polygonShape, ind, 0, { numVertices: 4 });
    expect(JSON.stringify(ind)).toBe(before);
  });

  test("with mutation rate 0, circle individual is unchanged", () => {
    const ind = createIndividual(circleShape, 5, {});
    const before = JSON.stringify(ind);
    mutate(circleShape, ind, 0, {});
    expect(JSON.stringify(ind)).toBe(before);
  });
});

describe("tournamentSelect", () => {
  test("consistently selects fitter individuals", () => {
    const pop = Array.from({ length: 10 }, () =>
      createIndividual(polygonShape, 3, { numVertices: 3 }),
    );
    const fit = [1, 100, 200, 300, 400, 500, 600, 700, 800, 900];

    let bestWins = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const selected = tournamentSelect(pop, fit, 3);
      if (selected === pop[0]) bestWins++;
    }

    expect(bestWins / trials).toBeGreaterThan(0.2);
  });

  test("returns an element from the population", () => {
    const pop = [
      createIndividual(polygonShape, 2, { numVertices: 3 }),
      createIndividual(polygonShape, 2, { numVertices: 3 }),
    ];
    const fit = [10, 20];
    const result = tournamentSelect(pop, fit, 2);
    expect(pop.includes(result)).toBe(true);
  });
});
