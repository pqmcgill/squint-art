// GA Web Worker — runs the evolution loop off the main thread.
// Bundled separately by bun as its own entry point.

import {
  polyFill, createRandomPolygon, clonePolygon, cloneIndividual,
  createIndividual, crossover, mutate, tournamentSelect,
} from "./operators.js";
import { pixelDiffJS, diffToSimilarity } from "./fitness.js";

let running = false;
let generation = 0;
let population = [];
let fitnesses = [];
let bestIndividual = null;
let bestFitness = Infinity;
let referenceData = null;
let width = 0;
let height = 0;
let config = {};
let canvas, ctx;

// Wasm fitness
let wasmDiff = null;
let wasmMem = null;
let wasmBuf = null;
let pixelLen = 0;

// Reduced-resolution fitness canvas
let fitCanvas, fitCtx;
let fitW = 0, fitH = 0, fitPixelLen = 0;

// Load Wasm
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

    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d", { willReadFrequently: true });

    const fitDiv = config.fitDiv || 1;
    fitW = Math.max(1, Math.round(width / fitDiv));
    fitH = Math.max(1, Math.round(height / fitDiv));
    fitPixelLen = fitW * fitH * 4;
    fitCanvas = new OffscreenCanvas(fitW, fitH);
    fitCtx = fitCanvas.getContext("2d", { willReadFrequently: true });

    // Scale reference to fitness resolution
    const tmpCanvas = new OffscreenCanvas(width, height);
    const tmpCtx = tmpCanvas.getContext("2d");
    const tmpImg = tmpCtx.createImageData(width, height);
    tmpImg.data.set(referenceData);
    tmpCtx.putImageData(tmpImg, 0, 0);
    fitCtx.drawImage(tmpCanvas, 0, 0, fitW, fitH);
    const fitRefData = fitCtx.getImageData(0, 0, fitW, fitH).data;

    const needed = 2 * fitPixelLen;
    const currentBytes = wasmMem.buffer.byteLength;
    if (needed > currentBytes) {
      wasmMem.grow(Math.ceil((needed - currentBytes) / 65536));
    }
    wasmBuf = new Uint8Array(wasmMem.buffer);
    wasmBuf.set(fitRefData, fitPixelLen);

    running = true;
    generation = 0;
    bestFitness = Infinity;
    bestIndividual = null;

    if (data.warmStart) {
      warmStartPopulation(data.warmStart);
    } else {
      initPopulation();
    }
    runGA();

  } else if (type === "stop") {
    running = false;

  } else if (type === "migrate") {
    if (population.length > 0 && data.polygons) {
      let worstIdx = 0;
      for (let i = 1; i < fitnesses.length; i++) {
        if (fitnesses[i] > fitnesses[worstIdx]) worstIdx = i;
      }
      const migrant = {
        polygons: data.polygons.map((p) => polyFill({
          points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
          r: p.r, g: p.g, b: p.b, a: p.a,
        })),
      };
      population[worstIdx] = migrant;
      fitnesses[worstIdx] = Infinity;
    }
  }
};

// --- Population ---

function initPopulation() {
  population = [];
  fitnesses = [];
  for (let i = 0; i < config.populationSize; i++) {
    population.push(createIndividual(config.numPolygons, config.numVertices));
    fitnesses.push(Infinity);
  }
}

function warmStartPopulation(polygons) {
  const seed = {
    polygons: polygons.map((p) => polyFill({
      points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
      r: p.r, g: p.g, b: p.b, a: p.a,
    })),
  };
  population = [];
  fitnesses = [];
  population.push(cloneIndividual(seed));
  fitnesses.push(Infinity);
  for (let i = 1; i < config.populationSize; i++) {
    const copy = cloneIndividual(seed);
    mutate(copy, config.mutationRate, config.numVertices);
    population.push(copy);
    fitnesses.push(Infinity);
  }
}

// --- Rendering & Fitness ---

function renderTo(individual, c, w, h) {
  c.fillStyle = "#000";
  c.fillRect(0, 0, w, h);
  for (const poly of individual.polygons) {
    c.beginPath();
    c.moveTo(poly.points[0].x * w, poly.points[0].y * h);
    for (let j = 1; j < poly.points.length; j++) {
      c.lineTo(poly.points[j].x * w, poly.points[j].y * h);
    }
    c.closePath();
    c.fillStyle = poly.fill;
    c.fill();
  }
}

function evaluateFitness(individual) {
  renderTo(individual, fitCtx, fitW, fitH);
  const imgData = fitCtx.getImageData(0, 0, fitW, fitH);
  wasmBuf.set(imgData.data, 0);
  return wasmDiff(fitPixelLen, 4);
}

function fullDiff() {
  renderTo(bestIndividual, ctx, width, height);
  const d = ctx.getImageData(0, 0, width, height).data;
  return pixelDiffJS(d, referenceData);
}

// --- GA Loop ---

function runGeneration() {
  for (let i = 0; i < population.length; i++) {
    fitnesses[i] = evaluateFitness(population[i]);
  }

  let genBestIdx = 0;
  for (let i = 1; i < population.length; i++) {
    if (fitnesses[i] < fitnesses[genBestIdx]) genBestIdx = i;
  }

  if (fitnesses[genBestIdx] < bestFitness) {
    bestFitness = fitnesses[genBestIdx];
    bestIndividual = cloneIndividual(population[genBestIdx]);
  }

  const next = [];
  next.push(cloneIndividual(population[genBestIdx]));

  while (next.length < config.populationSize) {
    const p1 = tournamentSelect(population, fitnesses, config.tournamentSize);
    const p2 = tournamentSelect(population, fitnesses, config.tournamentSize);
    const child = crossover(p1, p2);
    mutate(child, config.mutationRate, config.numVertices);
    next.push(child);
  }

  population = next;
}

async function runGA() {
  const maxGens = config.maxGenerations || 0;
  let lastUpdate = Date.now();

  while (running) {
    runGeneration();
    generation++;

    if (maxGens > 0 && generation >= maxGens) {
      const similarity = diffToSimilarity(fullDiff(), width, height);
      self.postMessage({
        type: "done",
        generation,
        similarity: +similarity.toFixed(2),
        polygons: bestIndividual.polygons,
      });
      running = false;
      return;
    }

    const now = Date.now();
    if (now - lastUpdate >= 150) {
      const similarity = diffToSimilarity(fullDiff(), width, height);
      self.postMessage({
        type: "update",
        generation,
        similarity: +similarity.toFixed(2),
        polygons: bestIndividual.polygons,
      });
      lastUpdate = now;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
