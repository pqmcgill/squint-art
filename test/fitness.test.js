import { describe, expect, test } from "bun:test";
import { diffToSimilarity, pixelDiffJS } from "../src/ga/fitness.js";

describe("pixelDiffJS", () => {
  test("identical buffers produce diff of 0", () => {
    const buf = new Uint8ClampedArray([100, 50, 200, 255, 0, 128, 64, 255]);
    expect(pixelDiffJS(buf, buf)).toBe(0);
  });

  test("known single-pixel difference", () => {
    // Pixel: rendered (100,50,200,255) vs ref (110,40,190,255)
    // dr=-10, dg=10, db=10 → 100+100+100 = 300
    const rendered = new Uint8ClampedArray([100, 50, 200, 255]);
    const reference = new Uint8ClampedArray([110, 40, 190, 255]);
    expect(pixelDiffJS(rendered, reference)).toBe(300);
  });

  test("ignores alpha channel", () => {
    // Same RGB, different alpha → diff should be 0
    const a = new Uint8ClampedArray([100, 100, 100, 255]);
    const b = new Uint8ClampedArray([100, 100, 100, 0]);
    expect(pixelDiffJS(a, b)).toBe(0);
  });

  test("max difference: black vs white pixel", () => {
    const black = new Uint8ClampedArray([0, 0, 0, 255]);
    const white = new Uint8ClampedArray([255, 255, 255, 255]);
    // 255^2 * 3 = 195075
    expect(pixelDiffJS(black, white)).toBe(195075);
  });

  test("accumulates across multiple pixels", () => {
    // Two pixels, each with dr=1,dg=0,db=0 → 1+1 = 2
    const a = new Uint8ClampedArray([1, 0, 0, 255, 1, 0, 0, 255]);
    const b = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
    expect(pixelDiffJS(a, b)).toBe(2);
  });
});

describe("diffToSimilarity", () => {
  test("zero diff → 100%", () => {
    expect(diffToSimilarity(0, 10, 10)).toBe(100);
  });

  test("max diff → 0%", () => {
    const maxDiff = 10 * 10 * 255 * 255 * 3;
    expect(diffToSimilarity(maxDiff, 10, 10)).toBe(0);
  });

  test("half diff → 50%", () => {
    const maxDiff = 10 * 10 * 255 * 255 * 3;
    expect(diffToSimilarity(maxDiff / 2, 10, 10)).toBe(50);
  });

  test("scales with image dimensions", () => {
    // Same absolute diff should give different similarity for different image sizes
    const diff = 1000;
    const sim10 = diffToSimilarity(diff, 10, 10);
    const sim100 = diffToSimilarity(diff, 100, 100);
    expect(sim100).toBeGreaterThan(sim10);
  });
});
