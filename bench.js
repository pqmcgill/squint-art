#!/usr/bin/env node
//
// Headless benchmark for Polygon GA.
// Single-thread runs use the shared GA engine directly.
// Island runs use worker_threads for real multi-core parallelism.
//

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { Worker: ThreadWorker } = require("worker_threads");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { GA } = require("./ga-engine-node.js");

// ── Config ──────────────────────────────────────────────────────────

const DURATION = 30_000;
const WARMUP = 3_000;

const NUM_CORES = os.cpus().length;
const ISLANDS = Math.max(2, NUM_CORES - 1);

const MATRIX = [
  // Single-thread baselines (fd2 is our current best default)
  { label: "128px 50pop 50poly 1t",     workRes: 128, populationSize: 50, numPolygons: 50, fitDiv: 2, islands: 1 },
  // Island model at same config
  { label: `128px 50pop 50poly ${ISLANDS}t`, workRes: 128, populationSize: 50, numPolygons: 50, fitDiv: 2, islands: ISLANDS },
  // Single vs island at higher load
  { label: "256px 50pop 50poly 1t",     workRes: 256, populationSize: 50, numPolygons: 50, fitDiv: 2, islands: 1 },
  { label: `256px 50pop 50poly ${ISLANDS}t`, workRes: 256, populationSize: 50, numPolygons: 50, fitDiv: 2, islands: ISLANDS },
  // More polygons
  { label: "128px 50pop 100poly 1t",    workRes: 128, populationSize: 50, numPolygons: 100, fitDiv: 2, islands: 1 },
  { label: `128px 50pop 100poly ${ISLANDS}t`, workRes: 128, populationSize: 50, numPolygons: 100, fitDiv: 2, islands: ISLANDS },
];

const FIXED = { numVertices: 6, mutationRate: 0.03, tournamentSize: 5 };

// ── Wasm loader ─────────────────────────────────────────────────────

let wasmInstance = null;

async function loadWasm() {
  const buf = fs.readFileSync(path.join(__dirname, "fitness.wasm"));
  const { instance } = await WebAssembly.instantiate(buf);
  wasmInstance = instance;
}

// ── Reference image ─────────────────────────────────────────────────

function prepareRef(img, workRes) {
  const scale = Math.min(workRes / img.width, workRes / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

// ── Single-thread runner ────────────────────────────────────────────

function runSingle(img, entry) {
  const cfg = { ...FIXED, ...entry };
  const { data, width, height } = prepareRef(img, cfg.workRes);
  const ga = new GA(data, width, height, cfg, createCanvas, wasmInstance);

  const warmEnd = performance.now() + WARMUP;
  while (performance.now() < warmEnd) ga.step();

  const genStart = ga.generation;
  const t0 = performance.now();
  const tEnd = t0 + DURATION;

  while (performance.now() < tEnd) ga.step();

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
  };
}

// ── Island (multi-thread) runner ────────────────────────────────────

function runIsland(img, entry) {
  const cfg = { ...FIXED, ...entry };
  const numIslands = entry.islands;
  const { data, width, height } = prepareRef(img, cfg.workRes);
  const wasmPath = path.join(__dirname, "fitness.wasm");

  return new Promise((resolve) => {
    const threads = [];
    const results = [];
    let done = 0;

    for (let i = 0; i < numIslands; i++) {
      const t = new ThreadWorker(path.join(__dirname, "bench-worker.js"), {
        workerData: {
          refData: Buffer.from(data.buffer),
          w: width,
          h: height,
          cfg,
          wasmPath,
          duration: DURATION,
          warmup: WARMUP,
        },
      });

      t.on("message", (msg) => {
        if (msg.type === "done") {
          results.push(msg);
          done++;
          if (done === numIslands) {
            // Aggregate: sum gen/s, take best similarity
            const totalGens = results.reduce((s, r) => s + r.generations, 0);
            const totalGenPerSec = results.reduce((s, r) => s + r.genPerSec, 0);
            const bestSim = Math.max(...results.map((r) => r.fullSimilarity));

            resolve({
              label: entry.label,
              config: cfg,
              workSize: `${width}x${height}`,
              generations: totalGens,
              genPerSec: +totalGenPerSec.toFixed(1),
              similarity: bestSim,
              elapsedSec: +(DURATION / 1000).toFixed(1),
            });
          }
        }
      });

      threads.push(t);
    }
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await loadWasm();

  const imagePath = process.argv[2] || path.join(__dirname, "reference.jpg");
  const img = await loadImage(imagePath);

  const total = MATRIX.length;
  const estMin = ((WARMUP + DURATION) * total / 60000).toFixed(1);

  console.log("Polygon GA Benchmark (Island Model)");
  console.log(`Image: ${path.basename(imagePath)} (${img.width}x${img.height})`);
  console.log(`Duration: ${DURATION / 1000}s per run + ${WARMUP / 1000}s warmup`);
  console.log(`Cores: ${NUM_CORES}  Islands: ${ISLANDS}`);
  console.log(`Runs: ${total}  (~${estMin} min total)`);
  console.log(`Node ${process.version}  ${process.platform}/${process.arch}\n`);

  const results = [];

  for (let i = 0; i < total; i++) {
    const entry = MATRIX[i];
    process.stdout.write(`[${i + 1}/${total}] ${entry.label.padEnd(32)} `);

    const r = entry.islands > 1
      ? await runIsland(img, entry)
      : runSingle(img, entry);

    results.push(r);
    console.log(
      `${String(r.genPerSec).padStart(7)} gen/s  ${(r.similarity + "%").padStart(8)}  ${r.generations.toLocaleString().padStart(10)} gens`,
    );
  }

  // Summary table
  const sep = "\u2500".repeat(84);
  console.log("\n" + sep);
  console.log(
    `${"#".padStart(3)}  ${"Config".padEnd(32)}  ${"Gen/s".padStart(8)}  ${"Sim %".padStart(8)}  ${"Gens".padStart(10)}  ${"Size".padStart(7)}`,
  );
  console.log(sep);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      `${String(i + 1).padStart(3)}  ${r.label.padEnd(32)}  ${String(r.genPerSec).padStart(8)}  ${(r.similarity + "%").padStart(8)}  ${r.generations.toLocaleString().padStart(10)}  ${r.workSize.padStart(7)}`,
    );
  }
  console.log(sep);

  // Save JSON
  const outDir = path.join(__dirname, "benchmark");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `island-${Date.now()}.json`);
  const report = {
    image: path.basename(imagePath),
    date: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cores: NUM_CORES,
    islands: ISLANDS,
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
