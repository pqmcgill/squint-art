// Pure GA operators — shape-agnostic. Per-shape geometry logic lives in
// shapes.js and is injected as a strategy object.

import { clamp, gaussianRandom } from "./math.js";
import { polygonShape } from "./shapes.js";

export { clamp, gaussianRandom };

export function polyFill(p) {
  p.fill = `rgba(${p.r},${p.g},${p.b},${p.a})`;
  return p;
}

function randomColor() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    a: Math.random() * 0.4 + 0.05,
  };
}

export function createRandomShape(strategy, params) {
  return polyFill({ ...strategy.createGeometry(params), ...randomColor() });
}

export function cloneShape(strategy, s) {
  return {
    ...strategy.cloneGeometry(s),
    r: s.r,
    g: s.g,
    b: s.b,
    a: s.a,
    fill: s.fill,
  };
}

export function cloneIndividual(strategy, ind) {
  return { polygons: ind.polygons.map((s) => cloneShape(strategy, s)) };
}

export function createIndividual(strategy, numShapes, params) {
  const polygons = [];
  for (let i = 0; i < numShapes; i++) {
    polygons.push(createRandomShape(strategy, params));
  }
  return { polygons };
}

// Single-point crossover — preserves ordering from each parent.
export function crossover(strategy, p1, p2) {
  const n = p1.polygons.length;
  const cut = Math.floor(Math.random() * (n - 1)) + 1;
  const child = { polygons: [] };
  for (let i = 0; i < n; i++) {
    const src = i < cut ? p1 : p2;
    child.polygons.push(cloneShape(strategy, src.polygons[i]));
  }
  return child;
}

export function mutate(strategy, individual, mutationRate, params) {
  const mr = mutationRate;

  for (let i = 0; i < individual.polygons.length; i++) {
    if (Math.random() < mr * 0.1) {
      individual.polygons[i] = createRandomShape(strategy, params);
      continue;
    }

    const s = individual.polygons[i];
    strategy.mutateGeometry(s, mr, params);

    let colorChanged = false;
    if (Math.random() < mr) {
      s.r = clamp(s.r + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      s.g = clamp(s.g + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      s.b = clamp(s.b + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      s.a = clamp(s.a + gaussianRandom() * 0.05, 0.01, 1);
      colorChanged = true;
    }
    if (colorChanged) polyFill(s);

    if (Math.random() < mr * 0.5) {
      const j = Math.floor(Math.random() * individual.polygons.length);
      [individual.polygons[i], individual.polygons[j]] = [
        individual.polygons[j],
        individual.polygons[i],
      ];
    }
  }
}

export function tournamentSelect(population, fitnesses, tournamentSize) {
  let bestIdx = Math.floor(Math.random() * population.length);
  for (let i = 1; i < tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (fitnesses[idx] < fitnesses[bestIdx]) bestIdx = idx;
  }
  return population[bestIdx];
}

// Back-compat shim for older tests / callers that pre-date the strategy API.
export function createRandomPolygon(numVertices) {
  return createRandomShape(polygonShape, { numVertices });
}

export function clonePolygon(s) {
  return cloneShape(polygonShape, s);
}
