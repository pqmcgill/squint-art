#!/usr/bin/env node
//
// Headless benchmark for Polygon GA.
// Single-thread runs use the shared GA engine directly.
// Island runs use worker_threads for real multi-core parallelism.
//

const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { Worker: ThreadWorker } = require("node:worker_threads");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { GA } = require("./ga-engine-node.js");

// ── Config ──────────────────────────────────────────────────────────

const DURATION = 30_000;
const WARMUP = 3_000;

const NUM_CORES = os.cpus().length;
const ISLANDS = Math.max(2, NUM_CORES - 1);

const MATRIX = [
  // Single thread baseline
  {
    label: "128px 1t (no migration)",
    workRes: 128,
    populationSize: 50,
    numPolygons: 50,
    fitDiv: 2,
    islands: 1,
  },
  // Topology comparison at same island count
  {
    label: `128px ${ISLANDS}t star`,
    workRes: 128,
    populationSize: 50,
    numPolygons: 50,
    fitDiv: 2,
    islands: ISLANDS,
    topology: "star",
  },
  {
    label: `128px ${ISLANDS}t ring`,
    workRes: 128,
    populationSize: 50,
    numPolygons: 50,
    fitDiv: 2,
    islands: ISLANDS,
    topology: "ring",
  },
  {
    label: `128px ${ISLANDS}t grid`,
    workRes: 128,
    populationSize: 50,
    numPolygons: 50,
    fitDiv: 2,
    islands: ISLANDS,
    topology: "grid",
  },
  {
    label: `128px ${ISLANDS}t no-migration`,
    workRes: 128,
    populationSize: 50,
    numPolygons: 50,
    fitDiv: 2,
    islands: ISLANDS,
    topology: "none",
  },
];

const FIXED = { numVertices: 6, mutationRate: 0.03, tournamentSize: 5 };

// ── Topology definitions ────────────────────────────────────────────

const TOPOLOGIES = {
  ring: (i, n) => [(i - 1 + n) % n, (i + 1) % n],
  grid: (i, n) => {
    const cols = Math.ceil(Math.sqrt(n));
    const row = Math.floor(i / cols);
    const col = i % cols;
    const out = [];
    if (row > 0) out.push((row - 1) * cols + col);
    if ((row + 1) * cols + col < n) out.push((row + 1) * cols + col);
    if (col > 0) out.push(row * cols + col - 1);
    if (col + 1 < cols && row * cols + col + 1 < n)
      out.push(row * cols + col + 1);
    return out;
  },
  star: (i, n) => {
    const out = [];
    for (let j = 0; j < n; j++) if (j !== i) out.push(j);
    return out;
  },
  none: () => [],
};

function selectSource(candidates, islandPolygons) {
  const valid = candidates.filter((i) => islandPolygons[i]);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];
  const a = valid[Math.floor(Math.random() * valid.length)];
  let b = valid[Math.floor(Math.random() * valid.length)];
  while (b === a && valid.length > 1)
    b = valid[Math.floor(Math.random() * valid.length)];
  return Math.random() < 0.7 ? a : b;
}

// ── Wasm loader ─────────────────────────────────────────────────────

let wasmInstance = null;

async function loadWasm() {
  const buf = fs.readFileSync(path.join(__dirname, "..", "..", "fitness.wasm"));
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
  const topology = entry.topology || "star";
  const neighborFn = TOPOLOGIES[topology] || TOPOLOGIES.none;
  const migrationInterval = 5000;
  const { data, width, height } = prepareRef(img, cfg.workRes);
  const wasmPath = path.resolve(__dirname, "fitness.wasm");

  return new Promise((resolve) => {
    const threads = [];
    const finalResults = [];
    const islandPolygons = new Array(numIslands).fill(null);
    let done = 0;

    for (let i = 0; i < numIslands; i++) {
      const t = new ThreadWorker(path.resolve(__dirname, "bench-worker.js"), {
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
        if (msg.type === "state") {
          islandPolygons[i] = msg.polygons;
        } else if (msg.type === "done") {
          finalResults.push(msg);
          done++;
          if (done === numIslands) {
            clearInterval(migTimer);
            const totalGens = finalResults.reduce(
              (s, r) => s + r.generations,
              0,
            );
            const totalGenPerSec = finalResults.reduce(
              (s, r) => s + r.genPerSec,
              0,
            );
            const bestSim = Math.max(
              ...finalResults.map((r) => r.fullSimilarity),
            );

            resolve({
              label: entry.label,
              config: { ...cfg, topology },
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

    // Periodic migration based on topology
    const migTimer = setInterval(() => {
      for (let i = 0; i < numIslands; i++) {
        const neighbors = neighborFn(i, numIslands);
        const source = selectSource(neighbors, islandPolygons);
        if (source !== null && islandPolygons[source]) {
          threads[i].postMessage({
            type: "migrate",
            polygons: islandPolygons[source],
          });
        }
      }
    }, migrationInterval);
  });
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  await loadWasm();

  const imagePath =
    process.argv[2] || path.join(__dirname, "..", "..", "img", "reference.jpg");
  const img = await loadImage(imagePath);

  const total = MATRIX.length;
  const estMin = (((WARMUP + DURATION) * total) / 60000).toFixed(1);

  console.log("Polygon GA Benchmark (Island Model)");
  console.log(
    `Image: ${path.basename(imagePath)} (${img.width}x${img.height})`,
  );
  console.log(
    `Duration: ${DURATION / 1000}s per run + ${WARMUP / 1000}s warmup`,
  );
  console.log(`Cores: ${NUM_CORES}  Islands: ${ISLANDS}`);
  console.log(`Runs: ${total}  (~${estMin} min total)`);
  console.log(`Node ${process.version}  ${process.platform}/${process.arch}\n`);

  const results = [];

  for (let i = 0; i < total; i++) {
    const entry = MATRIX[i];
    process.stdout.write(`[${i + 1}/${total}] ${entry.label.padEnd(32)} `);

    const r =
      entry.islands > 1 ? await runIsland(img, entry) : runSingle(img, entry);

    results.push(r);
    console.log(
      `${String(r.genPerSec).padStart(7)} gen/s  ${(`${r.similarity}%`).padStart(8)}  ${r.generations.toLocaleString().padStart(10)} gens`,
    );
  }

  // Summary table
  const sep = "\u2500".repeat(84);
  console.log(`\n${sep}`);
  console.log(
    `${"#".padStart(3)}  ${"Config".padEnd(32)}  ${"Gen/s".padStart(8)}  ${"Sim %".padStart(8)}  ${"Gens".padStart(10)}  ${"Size".padStart(7)}`,
  );
  console.log(sep);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(
      `${String(i + 1).padStart(3)}  ${r.label.padEnd(32)}  ${String(r.genPerSec).padStart(8)}  ${(`${r.similarity}%`).padStart(8)}  ${r.generations.toLocaleString().padStart(10)}  ${r.workSize.padStart(7)}`,
    );
  }
  console.log(sep);

  // Save JSON
  const outDir = path.join(__dirname, "..", "..", "benchmark");
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
