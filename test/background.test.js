import { describe, expect, test } from "bun:test";
import { detectBackgroundColor } from "../src/background.js";

// Build a uniform-color RGBA image
function uniform(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

// Build an image with a `borderColor` ring and a `centerColor` interior
function withBorder(w, h, borderColor, centerColor, ringDepth = 4) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inBorder =
        x < ringDepth ||
        x >= w - ringDepth ||
        y < ringDepth ||
        y >= h - ringDepth;
      const c = inBorder ? borderColor : centerColor;
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("detectBackgroundColor", () => {
  test("picks the uniform color of a solid image", () => {
    const data = uniform(50, 50, 200, 100, 50);
    expect(detectBackgroundColor(data, 50, 50)).toBe("#c86432");
  });

  test("returns black for a black image", () => {
    const data = uniform(20, 20, 0, 0, 0);
    expect(detectBackgroundColor(data, 20, 20)).toBe("#000000");
  });

  test("returns white for a white image", () => {
    const data = uniform(20, 20, 255, 255, 255);
    expect(detectBackgroundColor(data, 20, 20)).toBe("#ffffff");
  });

  test("picks the border color, ignoring center", () => {
    // Border is white, center is bright red — should pick white
    const data = withBorder(40, 40, [255, 255, 255], [255, 0, 0]);
    expect(detectBackgroundColor(data, 40, 40)).toBe("#ffffff");
  });

  test("returns lowercase hex with leading zeros", () => {
    const data = uniform(10, 10, 1, 2, 3);
    expect(detectBackgroundColor(data, 10, 10)).toBe("#010203");
  });

  test("handles tiny images without crashing", () => {
    const data = uniform(1, 1, 128, 64, 32);
    const result = detectBackgroundColor(data, 1, 1);
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});
