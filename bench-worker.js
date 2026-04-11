// Island worker thread for bench.js — runs GA in its own thread.

const { parentPort, workerData } = require("worker_threads");
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");
const path = require("path");
const { GA } = require("./ga-engine-node.js");

(async () => {
  const { refData, w, h, cfg, wasmPath, duration, warmup } = workerData;

  // Each thread loads its own Wasm instance (separate memory)
  const wasmBuf = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmBuf);

  const ga = new GA(new Uint8ClampedArray(refData), w, h, cfg, createCanvas, instance);

  // Warmup
  const warmEnd = performance.now() + warmup;
  while (performance.now() < warmEnd) ga.step();

  const genStart = ga.generation;
  const t0 = performance.now();
  const tEnd = t0 + duration;

  // Run generations, check for migration messages between generations
  while (performance.now() < tEnd) {
    ga.step();
  }

  const elapsed = (performance.now() - t0) / 1000;
  const gens = ga.generation - genStart;

  parentPort.postMessage({
    type: "done",
    generations: gens,
    genPerSec: +(gens / elapsed).toFixed(1),
    bestPolygons: ga.bestIndividual ? ga.bestIndividual.polygons : null,
    fullSimilarity: +ga.fullSimilarity().toFixed(2),
  });
})();

// Handle migration messages while running
parentPort.on("message", (msg) => {
  // Migration messages are fire-and-forget; the GA processes them
  // between generations via the main loop check above.
  // For simplicity in the benchmark, we skip runtime migration
  // and just measure raw parallel throughput.
});
