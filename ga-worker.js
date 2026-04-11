// Genetic Algorithm Web Worker
// Runs the entire GA loop off the main thread, using OffscreenCanvas for fitness evaluation.

let running = false;
let generation = 0;
let population = [];
let fitnesses = [];
let bestIndividual = null;
let bestFitness = Infinity;
let referenceData = null;  // Uint8ClampedArray
let width = 0;
let height = 0;
let config = {};
let canvas, ctx;

// Wasm fitness
let wasmDiff = null;       // pixel_diff(len) -> f64
let wasmMem = null;        // Wasm linear memory
let wasmBuf = null;        // Uint8Array view of wasmMem
let pixelLen = 0;          // width * height * 4

// Load Wasm module at worker startup
const wasmReady = fetch("fitness.wasm")
  .then((r) => r.arrayBuffer())
  .then((buf) => WebAssembly.instantiate(buf))
  .then(({ instance }) => {
    wasmDiff = instance.exports.pixel_diff;
    wasmMem = instance.exports.memory;
  });

self.onmessage = async function (e) {
  const { type, ...data } = e.data;
  if (type === "start") {
    await wasmReady;

    referenceData = new Uint8ClampedArray(data.imageData);
    width = data.width;
    height = data.height;
    config = data.config;
    pixelLen = width * height * 4;

    // Grow Wasm memory if needed (need 2 * pixelLen bytes)
    const needed = 2 * pixelLen;
    const currentBytes = wasmMem.buffer.byteLength;
    if (needed > currentBytes) {
      const pages = Math.ceil((needed - currentBytes) / 65536);
      wasmMem.grow(pages);
    }
    wasmBuf = new Uint8Array(wasmMem.buffer);

    // Copy reference data into Wasm memory at offset pixelLen
    wasmBuf.set(referenceData, pixelLen);

    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    running = true;
    generation = 0;
    bestFitness = Infinity;
    bestIndividual = null;
    initPopulation();
    runGA();
  } else if (type === "stop") {
    running = false;
  }
};

// --- Utilities ---

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// --- Individual / Polygon ---

function polyFill(p) {
  p.fill = `rgba(${p.r},${p.g},${p.b},${p.a})`;
  return p;
}

function createRandomPolygon() {
  const nv = config.numVertices;
  const cx = Math.random();
  const cy = Math.random();
  const radius = Math.random() * 0.15 + 0.02;
  const startAngle = Math.random() * Math.PI * 2;
  const points = [];

  for (let i = 0; i < nv; i++) {
    const angle = startAngle + (i / nv) * Math.PI * 2;
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

function clonePolygon(p) {
  return {
    points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
    r: p.r, g: p.g, b: p.b, a: p.a,
    fill: p.fill,
  };
}

function cloneIndividual(ind) {
  return { polygons: ind.polygons.map(clonePolygon) };
}

function createIndividual() {
  const polygons = [];
  for (let i = 0; i < config.numPolygons; i++) {
    polygons.push(createRandomPolygon());
  }
  return { polygons };
}

// --- Population ---

function initPopulation() {
  population = [];
  fitnesses = [];
  for (let i = 0; i < config.populationSize; i++) {
    population.push(createIndividual());
    fitnesses.push(Infinity);
  }
}

// --- Rendering & Fitness ---

function renderIndividual(individual) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  for (const poly of individual.polygons) {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x * width, poly.points[0].y * height);
    for (let j = 1; j < poly.points.length; j++) {
      ctx.lineTo(poly.points[j].x * width, poly.points[j].y * height);
    }
    ctx.closePath();
    ctx.fillStyle = poly.fill;
    ctx.fill();
  }
}

function evaluateFitness(individual) {
  renderIndividual(individual);

  // Copy rendered pixels into Wasm memory at offset 0
  const imgData = ctx.getImageData(0, 0, width, height);
  wasmBuf.set(imgData.data, 0);

  // Wasm computes sum of squared RGB diffs
  return wasmDiff(pixelLen);
}

// --- Selection ---

function tournamentSelect() {
  let bestIdx = Math.floor(Math.random() * population.length);
  for (let i = 1; i < config.tournamentSize; i++) {
    const idx = Math.floor(Math.random() * population.length);
    if (fitnesses[idx] < fitnesses[bestIdx]) {
      bestIdx = idx;
    }
  }
  return population[bestIdx];
}

// --- Crossover ---

function crossover(p1, p2) {
  const child = { polygons: [] };
  for (let i = 0; i < p1.polygons.length; i++) {
    const src = Math.random() < 0.5 ? p1 : p2;
    child.polygons.push(clonePolygon(src.polygons[i]));
  }
  return child;
}

// --- Mutation ---

function mutate(individual) {
  const mr = config.mutationRate;

  for (let i = 0; i < individual.polygons.length; i++) {
    // Hard mutation: replace entire polygon
    if (Math.random() < mr * 0.1) {
      individual.polygons[i] = createRandomPolygon();
      continue;
    }

    const poly = individual.polygons[i];

    // Point mutations
    for (const pt of poly.points) {
      if (Math.random() < mr) {
        pt.x = clamp(pt.x + gaussianRandom() * 0.05, 0, 1);
        pt.y = clamp(pt.y + gaussianRandom() * 0.05, 0, 1);
      }
    }

    // Color mutations
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

    // Swap order mutation (drawing order matters)
    if (Math.random() < mr * 0.5) {
      const j = Math.floor(Math.random() * individual.polygons.length);
      [individual.polygons[i], individual.polygons[j]] = [
        individual.polygons[j],
        individual.polygons[i],
      ];
    }
  }
}

// --- GA Loop ---

function runGeneration() {
  // Evaluate
  for (let i = 0; i < population.length; i++) {
    fitnesses[i] = evaluateFitness(population[i]);
  }

  // Find generation best
  let genBestIdx = 0;
  for (let i = 1; i < population.length; i++) {
    if (fitnesses[i] < fitnesses[genBestIdx]) genBestIdx = i;
  }

  // Track overall best
  if (fitnesses[genBestIdx] < bestFitness) {
    bestFitness = fitnesses[genBestIdx];
    bestIndividual = cloneIndividual(population[genBestIdx]);
  }

  // Build next generation
  const next = [];

  // Elitism: carry over the best unchanged
  next.push(cloneIndividual(population[genBestIdx]));

  while (next.length < config.populationSize) {
    const p1 = tournamentSelect();
    const p2 = tournamentSelect();
    const child = crossover(p1, p2);
    mutate(child);
    next.push(child);
  }

  population = next;
}

async function runGA() {
  let lastUpdate = Date.now();

  while (running) {
    runGeneration();
    generation++;

    const now = Date.now();
    if (now - lastUpdate >= 150) {
      const maxDiff = width * height * 255 * 255 * 3;
      const similarity = ((1 - bestFitness / maxDiff) * 100).toFixed(2);

      self.postMessage({
        type: "update",
        generation,
        similarity: parseFloat(similarity),
        polygons: bestIndividual.polygons,
      });

      lastUpdate = now;
      // Yield so stop messages can be processed
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
