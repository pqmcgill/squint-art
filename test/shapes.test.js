import { describe, expect, test } from "bun:test";
import { circleShape, getShape, polygonShape } from "../src/ga/shapes.js";

// Fake canvas ctx that records path calls — lets us verify drawPath
// without pulling in a real canvas implementation.
function fakeCtx() {
  const calls = [];
  return {
    calls,
    moveTo: (x, y) => calls.push(["moveTo", x, y]),
    lineTo: (x, y) => calls.push(["lineTo", x, y]),
    closePath: () => calls.push(["closePath"]),
    arc: (x, y, r, a0, a1) => calls.push(["arc", x, y, r, a0, a1]),
  };
}

describe("getShape", () => {
  test("resolves known names", () => {
    expect(getShape("polygon")).toBe(polygonShape);
    expect(getShape("circle")).toBe(circleShape);
  });

  test("falls back to polygon for unknown/missing names", () => {
    expect(getShape("unknown")).toBe(polygonShape);
    expect(getShape(undefined)).toBe(polygonShape);
  });
});

describe("polygonShape", () => {
  test("createGeometry returns numVertices points in [0,1]", () => {
    const g = polygonShape.createGeometry({ numVertices: 7 });
    expect(g.points).toHaveLength(7);
    for (const pt of g.points) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(1);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  test("cloneGeometry deep-copies the points array", () => {
    const g = polygonShape.createGeometry({ numVertices: 4 });
    const c = polygonShape.cloneGeometry(g);
    c.points[0].x = 999;
    expect(g.points[0].x).not.toBe(999);
  });

  test("mutateGeometry keeps coords in [0,1] at aggressive rates", () => {
    const g = polygonShape.createGeometry({ numVertices: 5 });
    for (let i = 0; i < 200; i++) {
      polygonShape.mutateGeometry(g, 1.0, { numVertices: 5 });
    }
    for (const pt of g.points) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThanOrEqual(1);
      expect(pt.y).toBeGreaterThanOrEqual(0);
      expect(pt.y).toBeLessThanOrEqual(1);
    }
  });

  test("drawPath issues moveTo + lineTo sequence and closePath", () => {
    const ctx = fakeCtx();
    const g = {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.5, y: 1 },
      ],
    };
    polygonShape.drawPath(ctx, g, 100, 200);

    expect(ctx.calls[0]).toEqual(["moveTo", 0, 0]);
    expect(ctx.calls[1]).toEqual(["lineTo", 100, 0]);
    expect(ctx.calls[2]).toEqual(["lineTo", 50, 200]);
    expect(ctx.calls[3]).toEqual(["closePath"]);
  });
});

describe("circleShape", () => {
  test("createGeometry returns x/y/radius in valid ranges", () => {
    const g = circleShape.createGeometry({});
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x).toBeLessThanOrEqual(1);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeLessThanOrEqual(1);
    expect(g.radius).toBeGreaterThan(0);
    expect(g.points).toBeUndefined();
  });

  test("cloneGeometry returns an independent copy", () => {
    const g = circleShape.createGeometry({});
    const c = circleShape.cloneGeometry(g);
    c.x = 999;
    c.radius = 999;
    expect(g.x).not.toBe(999);
    expect(g.radius).not.toBe(999);
  });

  test("mutateGeometry keeps coords in [0,1] and radius bounded", () => {
    const g = circleShape.createGeometry({});
    for (let i = 0; i < 200; i++) {
      circleShape.mutateGeometry(g, 1.0, {});
    }
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x).toBeLessThanOrEqual(1);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeLessThanOrEqual(1);
    expect(g.radius).toBeGreaterThanOrEqual(0.002);
    expect(g.radius).toBeLessThanOrEqual(0.5);
  });

  test("drawPath issues a single arc at scaled coords", () => {
    const ctx = fakeCtx();
    const g = { x: 0.5, y: 0.25, radius: 0.1 };
    circleShape.drawPath(ctx, g, 400, 200);

    expect(ctx.calls).toHaveLength(1);
    const [name, cx, cy, r, a0, a1] = ctx.calls[0];
    expect(name).toBe("arc");
    expect(cx).toBe(200);
    expect(cy).toBe(50);
    // radius scales to min(w,h) = 200, so 0.1 * 200 = 20
    expect(r).toBe(20);
    expect(a0).toBe(0);
    expect(a1).toBeCloseTo(Math.PI * 2);
  });
});
