// Pure topology definitions and migration source selection.

export const TOPOLOGIES = {
  ring: {
    label: "Ring",
    neighbors(i, n) {
      return [(i - 1 + n) % n, (i + 1) % n];
    },
  },
  grid: {
    label: "Grid",
    neighbors(i, n) {
      const cols = Math.ceil(Math.sqrt(n));
      const row = Math.floor(i / cols);
      const col = i % cols;
      const out = [];
      if (row > 0) out.push((row - 1) * cols + col);
      if ((row + 1) * cols + col < n) out.push((row + 1) * cols + col);
      if (col > 0) out.push(row * cols + col - 1);
      if (col + 1 < cols && row * cols + col + 1 < n) out.push(row * cols + col + 1);
      return out;
    },
  },
  star: {
    label: "Star",
    neighbors(i, n) {
      const out = [];
      for (let j = 0; j < n; j++) if (j !== i) out.push(j);
      return out;
    },
  },
};

// Fitness-weighted source selection among candidate islands.
// 70/30 bias toward the fitter of two random candidates.
export function selectSource(candidates, islandState) {
  const valid = candidates.filter((i) => islandState[i] && islandState[i].polygons);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  const a = valid[Math.floor(Math.random() * valid.length)];
  let b = valid[Math.floor(Math.random() * valid.length)];
  while (b === a && valid.length > 1) b = valid[Math.floor(Math.random() * valid.length)];

  const simA = islandState[a].similarity;
  const simB = islandState[b].similarity;
  const better = simA >= simB ? a : b;
  const worse = simA >= simB ? b : a;

  return Math.random() < 0.7 ? better : worse;
}
