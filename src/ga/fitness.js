// Pure fitness calculations — JS fallback pixel diff, similarity math.

// Sum of squared RGB differences between two pixel buffers (Uint8ClampedArray).
export function pixelDiffJS(rendered, reference) {
  let diff = 0;
  for (let i = 0, len = rendered.length; i < len; i += 4) {
    const dr = rendered[i] - reference[i];
    const dg = rendered[i + 1] - reference[i + 1];
    const db = rendered[i + 2] - reference[i + 2];
    diff += dr * dr + dg * dg + db * db;
  }
  return diff;
}

// Convert raw diff to similarity percentage.
export function diffToSimilarity(diff, width, height) {
  const maxDiff = width * height * 255 * 255 * 3;
  return (1 - diff / maxDiff) * 100;
}
