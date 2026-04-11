import { describe, expect, test } from "bun:test";
import { selectSource, TOPOLOGIES } from "../src/ga/topology.js";

describe("ring topology", () => {
  const ring = TOPOLOGIES.ring;

  test("returns exactly 2 neighbors", () => {
    expect(ring.neighbors(3, 9)).toHaveLength(2);
  });

  test("wraps at the start", () => {
    expect(ring.neighbors(0, 9)).toEqual([8, 1]);
  });

  test("wraps at the end", () => {
    expect(ring.neighbors(8, 9)).toEqual([7, 0]);
  });

  test("middle node gets adjacent neighbors", () => {
    expect(ring.neighbors(4, 9)).toEqual([3, 5]);
  });

  test("2-node ring: each is the other's only neighbor (listed twice)", () => {
    expect(ring.neighbors(0, 2)).toEqual([1, 1]);
  });
});

describe("grid topology", () => {
  const grid = TOPOLOGIES.grid;

  // 9 nodes → 3x3 grid:
  //  0 1 2
  //  3 4 5
  //  6 7 8

  test("corner node (0) has 2 neighbors", () => {
    const n = grid.neighbors(0, 9);
    expect(n).toHaveLength(2);
    expect(n).toContain(1); // right
    expect(n).toContain(3); // below
  });

  test("edge node (1) has 3 neighbors", () => {
    const n = grid.neighbors(1, 9);
    expect(n).toHaveLength(3);
    expect(n).toContain(0); // left
    expect(n).toContain(2); // right
    expect(n).toContain(4); // below
  });

  test("center node (4) has 4 neighbors", () => {
    const n = grid.neighbors(4, 9);
    expect(n).toHaveLength(4);
    expect(n).toContain(1); // above
    expect(n).toContain(3); // left
    expect(n).toContain(5); // right
    expect(n).toContain(7); // below
  });

  test("no self-references in any node's neighbors", () => {
    for (let i = 0; i < 9; i++) {
      expect(grid.neighbors(i, 9)).not.toContain(i);
    }
  });
});

describe("star topology", () => {
  const star = TOPOLOGIES.star;

  test("every node connects to all others", () => {
    const n = star.neighbors(0, 5);
    expect(n).toEqual([1, 2, 3, 4]);
  });

  test("no self-reference", () => {
    expect(star.neighbors(3, 5)).not.toContain(3);
  });

  test("returns n-1 neighbors", () => {
    expect(star.neighbors(0, 9)).toHaveLength(8);
  });
});

describe("selectSource", () => {
  test("returns null when no candidates have state", () => {
    const state = [null, null, null];
    expect(selectSource([0, 1, 2], state)).toBeNull();
  });

  test("returns the only valid candidate", () => {
    const state = [null, { similarity: 95, polygons: [] }, null];
    expect(selectSource([0, 1, 2], state)).toBe(1);
  });

  test("returns a valid island index", () => {
    const state = [
      { similarity: 90, polygons: [] },
      { similarity: 95, polygons: [] },
      { similarity: 92, polygons: [] },
    ];
    const result = selectSource([0, 1, 2], state);
    expect([0, 1, 2]).toContain(result);
  });

  test("biases toward fitter islands over many trials", () => {
    const state = [
      { similarity: 50, polygons: [] },
      { similarity: 99, polygons: [] },
    ];

    let betterWins = 0;
    for (let i = 0; i < 500; i++) {
      if (selectSource([0, 1], state) === 1) betterWins++;
    }

    // 70/30 bias should make the fitter island win most of the time
    expect(betterWins / 500).toBeGreaterThan(0.5);
  });
});
