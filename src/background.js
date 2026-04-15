// Auto-detect background color from a reference image.
// Samples the outer pixel ring (border) and computes per-channel median.
// Robust to outliers (e.g., a subject silhouette touching one edge).

const RING_DEPTH = 2;

/**
 * @param {Uint8ClampedArray} data - RGBA pixel buffer
 * @param {number} width
 * @param {number} height
 * @returns {string} hex color "#rrggbb"
 */
export function detectBackgroundColor(data, width, height) {
  const ring = Math.min(RING_DEPTH, Math.floor(Math.min(width, height) / 2));
  if (ring < 1) {
    // Image too small — sample the single pixel
    return rgbToHex(data[0], data[1], data[2]);
  }

  const rs = [];
  const gs = [];
  const bs = [];

  // Top + bottom strips
  for (let y = 0; y < ring; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  for (let y = height - ring; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }
  // Left + right strips (excluding corners already counted)
  for (let y = ring; y < height - ring; y++) {
    for (let x = 0; x < ring; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
    for (let x = width - ring; x < width; x++) {
      const i = (y * width + x) * 4;
      rs.push(data[i]);
      gs.push(data[i + 1]);
      bs.push(data[i + 2]);
    }
  }

  return rgbToHex(median(rs), median(gs), median(bs));
}

function median(arr) {
  arr.sort((a, b) => a - b);
  const mid = arr.length >> 1;
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) >> 1;
}

function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
