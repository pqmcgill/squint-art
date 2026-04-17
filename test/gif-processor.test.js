import { describe, expect, test } from "bun:test";
import { resolveFrameBackground } from "../src/gif/processor.js";

// Build a w×h RGBA ImageData.data buffer with a solid fill.
function solidFrame(w, h, [r, g, b]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("resolveFrameBackground", () => {
  test("returns the picker color when auto is off", () => {
    const data = solidFrame(10, 10, [200, 100, 50]);
    const bg = resolveFrameBackground(data, 10, 10, {
      autoBackground: false,
      background: "#123456",
    });
    expect(bg).toBe("#123456");
  });

  test("falls back to black when auto is off and no picker color", () => {
    const data = solidFrame(10, 10, [200, 100, 50]);
    const bg = resolveFrameBackground(data, 10, 10, { autoBackground: false });
    expect(bg).toBe("#000");
  });

  test("detects from the frame's own pixels when auto is on", () => {
    // Solid red frame → auto-detect should return red regardless of picker
    const data = solidFrame(20, 20, [255, 0, 0]);
    const bg = resolveFrameBackground(data, 20, 20, {
      autoBackground: true,
      background: "#000000",
    });
    expect(bg).toBe("#ff0000");
  });

  test("different frames resolve to different backgrounds under auto", () => {
    const red = solidFrame(20, 20, [255, 0, 0]);
    const blue = solidFrame(20, 20, [0, 0, 255]);
    const cfg = { autoBackground: true, background: "#888888" };
    expect(resolveFrameBackground(red, 20, 20, cfg)).toBe("#ff0000");
    expect(resolveFrameBackground(blue, 20, 20, cfg)).toBe("#0000ff");
  });
});
