#!/usr/bin/env node
//
// Headless benchmark for Polygon GA.
// Replicates the exact GA logic from ga-worker.js so timings are comparable.
//

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");

// ── Wasm fitness module ─────────────────────────────────────────────

let wasmInstance = null;

async function loadWasm() {
  const buf = fs.readFileSync(path.join(__dirname, "fitness.wasm"));
  const { instance } = await WebAssembly.instantiate(buf);
  wasmInstance = instance;
}

// ── Config ──────────────────────────────────────────────────────────

const DURATION = 30_000; // ms per run
const WARMUP = 3_000;    // ms warmup (not counted)

const MATRIX = [
  // Fitness downscale sweep at baseline
  { label: "128px 50pop 50poly fd1",   workRes: 128, populationSize: 50, numPolygons: 50,  fitDiv: 1 },
  { label: "128px 50pop 50poly fd2",   workRes: 128, populationSize: 50, numPolygons: 50,  fitDiv: 2 },
  { label: "128px 50pop 50poly fd4",   workRes: 128, populationSize: 50, numPolygons: 50,  fitDiv: 4 },
  // Higher resolution (more rendering cost to cut)
  { label: "256px 50pop 50poly fd1",   workRes: 256, populationSize: 50, numPolygons: 50,  fitDiv: 1 },
  { label: "256px 50pop 50poly fd2",   workRes: 256, populationSize: 50, numPolygons: 50,  fitDiv: 2 },
  { label: "256px 50pop 50poly fd4",   workRes: 256, populationSize: 50, numPolygons: 50,  fitDiv: 4 },
  // More polygons (render cost scales with polygon count)
  { label: "128px 50pop 100poly fd1",  workRes: 128, populationSize: 50, numPolygons: 100, fitDiv: 1 },
  { label: "128px 50pop 100poly fd2",  workRes: 128, populationSize: 50, numPolygons: 100, fitDiv: 2 },
  { label: "128px 50pop 200poly fd1",  workRes: 128, populationSize: 50, numPolygons: 200, fitDiv: 1 },
  { label: "128px 50pop 200poly fd2",  workRes: 128, populationSize: 50, numPolygons: 200, fitDiv: 2 },
];

const FIXED = { numVertices: 6, mutationRate: 0.03, tournamentSize: 5 };

// ── GA Engine (mirrors ga-worker.js) ────────────────────────────────

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class GA {
  constructor(refData, w, h, cfg) {
    this.refData = refData;
    this.w = w;
    this.h = h;
    this.cfg = cfg;

    // Full-res canvas (for display / fullSimilarity)
    this.canvas = createCanvas(w, h);
    this.ctx = this.canvas.getContext("2d");

    // Reduced-resolution fitness canvas
    const fitDiv = cfg.fitDiv || 1;
    this.fitW = Math.max(1, Math.round(w / fitDiv));
    this.fitH = Math.max(1, Math.round(h / fitDiv));
    this.fitPixelLen = this.fitW * this.fitH * 4;
    this.fitCanvas = createCanvas(this.fitW, this.fitH);
    this.fitCtx = this.fitCanvas.getContext("2d");

    // Scale reference to fitness resolution
    const tmpCanvas = createCanvas(w, h);
    const tmpCtx = tmpCanvas.getContext("2d");
    const tmpImg = tmpCtx.createImageData(w, h);
    tmpImg.data.set(refData);
    tmpCtx.putImageData(tmpImg, 0, 0);
    this.fitCtx.drawImage(tmpCanvas, 0, 0, this.fitW, this.fitH);
    const fitRefData = this.fitCtx.getImageData(0, 0, this.fitW, this.fitH).data;

    // Wasm memory for fitness-sized buffers
    const mem = wasmInstance.exports.memory;
    const needed = 2 * this.fitPixelLen;
    if (needed > mem.buffer.byteLength) {
      mem.grow(Math.ceil((needed - mem.buffer.byteLength) / 65536));
    }
    this.wasmBuf = new Uint8Array(mem.buffer);
    this.wasmBuf.set(fitRefData, this.fitPixelLen);

    this.population = [];
    this.fitnesses = [];
    this.bestFitness = Infinity;
    this.bestIndividual = null;
    this.generation = 0;
    this._initPopulation();
  }

  static _polyFill(p) {
    p.fill = `rgba(${p.r},${p.g},${p.b},${p.a})`;
    return p;
  }

  // ── Polygon / Individual ──

  _randomPolygon() {
    const nv = this.cfg.numVertices;
    const cx = Math.random();
    const cy = Math.random();
    const radius = Math.random() * 0.15 + 0.02;
    const start = Math.random() * Math.PI * 2;
    const points = [];
    for (let i = 0; i < nv; i++) {
      const a = start + (i / nv) * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      points.push({
        x: clamp(cx + Math.cos(a) * r, 0, 1),
        y: clamp(cy + Math.sin(a) * r, 0, 1),
      });
    }
    return GA._polyFill({
      points,
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
      a: Math.random() * 0.4 + 0.05,
    });
  }

  _clonePoly(p) {
    return {
      points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
      r: p.r, g: p.g, b: p.b, a: p.a,
      fill: p.fill,
    };
  }

  _cloneInd(ind) {
    return { polygons: ind.polygons.map((p) => this._clonePoly(p)) };
  }

  _createIndividual() {
    const polys = [];
    for (let i = 0; i < this.cfg.numPolygons; i++) polys.push(this._randomPolygon());
    return { polygons: polys };
  }

  _initPopulation() {
    this.population = [];
    this.fitnesses = [];
    for (let i = 0; i < this.cfg.populationSize; i++) {
      this.population.push(this._createIndividual());
      this.fitnesses.push(Infinity);
    }
  }

  // ── Render & Fitness ──

  _renderTo(ind, c, w, h) {
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    for (const poly of ind.polygons) {
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

  _fitness(ind) {
    this._renderTo(ind, this.fitCtx, this.fitW, this.fitH);
    const data = this.fitCtx.getImageData(0, 0, this.fitW, this.fitH).data;
    this.wasmBuf.set(data, 0);
    return wasmInstance.exports.pixel_diff(this.fitPixelLen, 4);
  }

  // Full-resolution similarity for final reporting (JS loop, called once)
  fullSimilarity() {
    this._renderTo(this.bestIndividual, this.ctx, this.w, this.h);
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const ref = this.refData;
    let diff = 0;
    for (let i = 0, len = d.length; i < len; i += 4) {
      const dr = d[i] - ref[i];
      const dg = d[i + 1] - ref[i + 1];
      const db = d[i + 2] - ref[i + 2];
      diff += dr * dr + dg * dg + db * db;
    }
    const maxDiff = this.w * this.h * 255 * 255 * 3;
    return (1 - diff / maxDiff) * 100;
  }

  // ── Selection / Crossover / Mutation ──

  _tournamentSelect() {
    let best = Math.floor(Math.random() * this.population.length);
    for (let i = 1; i < this.cfg.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * this.population.length);
      if (this.fitnesses[idx] < this.fitnesses[best]) best = idx;
    }
    return this.population[best];
  }

  _crossover(p1, p2) {
    const child = { polygons: [] };
    for (let i = 0; i < p1.polygons.length; i++) {
      const src = Math.random() < 0.5 ? p1 : p2;
      child.polygons.push(this._clonePoly(src.polygons[i]));
    }
    return child;
  }

  _mutate(ind) {
    const mr = this.cfg.mutationRate;
    for (let i = 0; i < ind.polygons.length; i++) {
      if (Math.random() < mr * 0.1) {
        ind.polygons[i] = this._randomPolygon();
        continue;
      }
      const poly = ind.polygons[i];
      for (const pt of poly.points) {
        if (Math.random() < mr) {
          pt.x = clamp(pt.x + gaussianRandom() * 0.05, 0, 1);
          pt.y = clamp(pt.y + gaussianRandom() * 0.05, 0, 1);
        }
      }
      let cc = false;
      if (Math.random() < mr) { poly.r = clamp(poly.r + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.g = clamp(poly.g + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.b = clamp(poly.b + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.a = clamp(poly.a + gaussianRandom() * 0.05, 0.01, 1); cc = true; }
      if (cc) GA._polyFill(poly);
      if (Math.random() < mr * 0.5) {
        const j = Math.floor(Math.random() * ind.polygons.length);
        [ind.polygons[i], ind.polygons[j]] = [ind.polygons[j], ind.polygons[i]];
      }
    }
  }

  // ── One generation ──

  step() {
    for (let i = 0; i < this.population.length; i++) {
      this.fitnesses[i] = this._fitness(this.population[i]);
    }

    let bestIdx = 0;
    for (let i = 1; i < this.population.length; i++) {
      if (this.fitnesses[i] < this.fitnesses[bestIdx]) bestIdx = i;
    }

    if (this.fitnesses[bestIdx] < this.bestFitness) {
      this.bestFitness = this.fitnesses[bestIdx];
      this.bestIndividual = this._cloneInd(this.population[bestIdx]);
    }

    const next = [this._cloneInd(this.population[bestIdx])];
    while (next.length < this.cfg.populationSize) {
      const child = this._crossover(this._tournamentSelect(), this._tournamentSelect());
      this._mutate(child);
      next.push(child);
    }

    this.population = next;
    this.generation++;
  }

  similarity() {
    const maxDiff = this.w * this.h * 255 * 255 * 3;
    return (1 - this.bestFitness / maxDiff) * 100;
  }
}

// ── Benchmark runner ────────────────────────────────────────────────

function prepareRef(img, workRes) {
  const scale = Math.min(workRes / img.width, workRes / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

function runOne(img, entry) {
  const cfg = { ...FIXED, ...entry };
  const { data, width, height } = prepareRef(img, cfg.workRes);
  const ga = new GA(data, width, height, cfg);

  // Warmup
  const warmEnd = performance.now() + WARMUP;
  while (performance.now() < warmEnd) ga.step();

  // Reset counters (keep population state — JIT is warm)
  const genStart = ga.generation;
  const t0 = performance.now();
  const tEnd = t0 + DURATION;

  const samples = []; // periodic snapshots for the curve
  let lastSample = t0;

  while (performance.now() < tEnd) {
    ga.step();
    const now = performance.now();
    if (now - lastSample >= 500) {
      samples.push({
        gen: ga.generation - genStart,
        similarity: +ga.similarity().toFixed(3),
        time: +((now - t0) / 1000).toFixed(2),
      });
      lastSample = now;
    }
  }

  const elapsed = (performance.now() - t0) / 1000;
  const gens = ga.generation - genStart;

  return {
    label: entry.label,
    config: cfg,
    workSize: `${width}x${height}`,
    generations: gens,
    genPerSec: +(gens / elapsed).toFixed(1),
    similarity: +ga.fullSimilarity().toFixed(2),
    elapsedSec: +elapsed.toFixed(1),
    samples,
  };
}

async function main() {
  await loadWasm();

  const imagePath = process.argv[2] || path.join(__dirname, "reference.jpg");
  const img = await loadImage(imagePath);

  const total = MATRIX.length;
  const estMin = ((WARMUP + DURATION) * total / 60000).toFixed(1);

  console.log("Polygon GA Benchmark");
  console.log(`Image: ${path.basename(imagePath)} (${img.width}x${img.height})`);
  console.log(`Duration: ${DURATION / 1000}s per run + ${WARMUP / 1000}s warmup`);
  console.log(`Runs: ${total}  (~${estMin} min total)`);
  console.log(`Node ${process.version}  ${process.platform}/${process.arch}\n`);

  const results = [];

  for (let i = 0; i < total; i++) {
    const entry = MATRIX[i];
    process.stdout.write(`[${i + 1}/${total}] ${entry.label.padEnd(28)} `);
    const r = runOne(img, entry);
    results.push(r);
    console.log(
      `${String(r.genPerSec).padStart(7)} gen/s  ${(r.similarity + "%").padStart(8)}  ${r.generations.toLocaleString().padStart(8)} gens`,
    );
  }

  // Summary table
  const sep = "\u2500".repeat(80);
  console.log("\n" + sep);
  console.log(
    `${"#".padStart(3)}  ${"Config".padEnd(28)}  ${"Gen/s".padStart(8)}  ${"Sim %".padStart(8)}  ${"Gens".padStart(10)}  ${"Size".padStart(7)}`,
  );
  console.log(sep);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      `${String(i + 1).padStart(3)}  ${r.label.padEnd(28)}  ${String(r.genPerSec).padStart(8)}  ${(r.similarity + "%").padStart(8)}  ${r.generations.toLocaleString().padStart(10)}  ${r.workSize.padStart(7)}`,
    );
  }
  console.log(sep);

  // Save JSON
  const outDir = path.join(__dirname, "benchmark");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `baseline-${Date.now()}.json`);
  const report = {
    image: path.basename(imagePath),
    date: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    durationMs: DURATION,
    warmupMs: WARMUP,
    results,
  };
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nSaved to ${path.relative(process.cwd(), outFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
