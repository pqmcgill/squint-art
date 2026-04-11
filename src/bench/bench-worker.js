// Island worker thread for bench.js — runs GA in its own thread.
// Supports periodic state reporting and migration via receiveMessageOnPort.

const {
  parentPort,
  workerData,
  receiveMessageOnPort,
} = require("node:worker_threads");
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("node:fs");
const { GA } = require("./ga-engine-node.js");

(async () => {
  const { refData, w, h, cfg, wasmPath, duration, warmup } = workerData;

  const wasmBuf = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmBuf);

  const ga = new GA(
    new Uint8ClampedArray(refData),
    w,
    h,
    cfg,
    createCanvas,
    instance,
  );

  // Warmup
  const warmEnd = performance.now() + warmup;
  while (performance.now() < warmEnd) ga.step();

  const genStart = ga.generation;
  const t0 = performance.now();
  const tEnd = t0 + duration;
  let lastReport = t0;

  while (performance.now() < tEnd) {
    ga.step();

    // Non-blocking check for migration messages
    for (
      let msg = receiveMessageOnPort(parentPort);
      msg;
      msg = receiveMessageOnPort(parentPort)
    ) {
      if (msg.message.type === "migrate" && msg.message.polygons) {
        ga.migrate(msg.message.polygons);
      }
    }

    // Report state every second for migration coordination
    const now = performance.now();
    if (now - lastReport >= 1000) {
      parentPort.postMessage({
        type: "state",
        generation: ga.generation - genStart,
        polygons: ga.bestIndividual ? ga.bestIndividual.polygons : null,
      });
      lastReport = now;
    }
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
