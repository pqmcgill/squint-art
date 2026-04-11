// Pure GA operators — polygon creation, cloning, crossover, mutation.
// Shared by worker and (potentially) tests.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function gaussianRandom() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function polyFill(p) {
  p.fill = `rgba(${p.r},${p.g},${p.b},${p.a})`;
  return p;
}

export function createRandomPolygon(numVertices) {
  const cx = Math.random();
  const cy = Math.random();
  const radius = Math.random() * 0.15 + 0.02;
  const startAngle = Math.random() * Math.PI * 2;
  const points = [];

  for (let i = 0; i < numVertices; i++) {
    const angle = startAngle + (i / numVertices) * Math.PI * 2;
    const r = radius * (0.5 + Math.random() * 0.5);
    points.push({
      x: clamp(cx + Math.cos(angle) * r, 0, 1),
      y: clamp(cy + Math.sin(angle) * r, 0, 1),
    });
  }

  return polyFill({
    points,
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    a: Math.random() * 0.4 + 0.05,
  });
}

export function clonePolygon(p) {
  return {
    points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
    r: p.r,
    g: p.g,
    b: p.b,
    a: p.a,
    fill: p.fill,
  };
}

export function cloneIndividual(ind) {
  return { polygons: ind.polygons.map(clonePolygon) };
}

export function createIndividual(numPolygons, numVertices) {
  const polygons = [];
  for (let i = 0; i < numPolygons; i++) {
    polygons.push(createRandomPolygon(numVertices));
  }
  return { polygons };
}

export function crossover(p1, p2) {
  const child = { polygons: [] };
  for (let i = 0; i < p1.polygons.length; i++) {
    const src = Math.random() < 0.5 ? p1 : p2;
    child.polygons.push(clonePolygon(src.polygons[i]));
  }
  return child;
}

export function mutate(individual, mutationRate, numVertices) {
  const mr = mutationRate;

  for (let i = 0; i < individual.polygons.length; i++) {
    if (Math.random() < mr * 0.1) {
      individual.polygons[i] = createRandomPolygon(numVertices);
      continue;
    }

    const poly = individual.polygons[i];

    for (const pt of poly.points) {
      if (Math.random() < mr) {
        pt.x = clamp(pt.x + gaussianRandom() * 0.05, 0, 1);
        pt.y = clamp(pt.y + gaussianRandom() * 0.05, 0, 1);
      }
    }

    let colorChanged = false;
    if (Math.random() < mr) {
      poly.r = clamp(poly.r + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      poly.g = clamp(poly.g + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      poly.b = clamp(poly.b + Math.floor(gaussianRandom() * 20), 0, 255);
      colorChanged = true;
    }
    if (Math.random() < mr) {
      poly.a = clamp(poly.a + gaussianRandom() * 0.05, 0.01, 1);
      colorChanged = true;
    }
    if (colorChanged) polyFill(poly);

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
