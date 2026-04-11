// Main UI logic — image handling, island model worker management, rendering

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const workspace = document.getElementById("workspace");
const referenceCanvas = document.getElementById("reference-canvas");
const outputCanvas = document.getElementById("output-canvas");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const resetBtn = document.getElementById("reset-btn");
const newImageBtn = document.getElementById("new-image-btn");
const genCountEl = document.getElementById("gen-count");
const similarityEl = document.getElementById("similarity-value");
const gpsEl = document.getElementById("gens-per-sec");
const islandsEl = document.getElementById("islands-value");
const downloadBtn = document.getElementById("download-btn");
const bestLabel = document.getElementById("best-label");
const chartCanvas = document.getElementById("chart-canvas");

const migrationCanvas = document.getElementById("migration-canvas");

const benchmark = new Benchmark(chartCanvas);
const migViz = new MigrationViz(migrationCanvas);

let workers = [];
let migrationTimer = null;
let referenceImage = null;
let startTime = 0;

// Per-island tracking
let islandState = [];    // { generation, similarity, polygons } per island
let globalBest = null;   // { similarity, polygons }

// ---- Drag & Drop ----

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) loadImage(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) loadImage(file);
});

// ---- Image Loading ----

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      referenceImage = img;
      setupWorkspace(img);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function setupWorkspace(img) {
  const maxDisplay = 400;
  const scale = Math.min(maxDisplay / img.width, maxDisplay / img.height, 1);
  const dw = Math.round(img.width * scale);
  const dh = Math.round(img.height * scale);

  referenceCanvas.width = dw;
  referenceCanvas.height = dh;
  outputCanvas.width = dw;
  outputCanvas.height = dh;

  referenceCanvas.getContext("2d").drawImage(img, 0, 0, dw, dh);

  dropZone.classList.add("hidden");
  workspace.classList.remove("hidden");

  requestAnimationFrame(() => {
    benchmark.resize();
    migViz.resize();
  });
  resetStats();
}

// ---- Settings ----

function getConfig() {
  return {
    populationSize: parseInt(document.getElementById("pop-size").value),
    numPolygons: parseInt(document.getElementById("num-polygons").value),
    numVertices: parseInt(document.getElementById("num-vertices").value),
    mutationRate: parseFloat(document.getElementById("mutation-rate").value),
    tournamentSize: parseInt(document.getElementById("tournament-size").value),
    fitDiv: parseInt(document.getElementById("fit-div").value),
    subSample: parseInt(document.getElementById("sub-sample").value),
  };
}

function getWorkImageData() {
  const workRes = parseInt(document.getElementById("work-res").value);
  const img = referenceImage;
  const scale = Math.min(workRes / img.width, workRes / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d");
  tctx.drawImage(img, 0, 0, w, h);
  return { data: tctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

// ---- Island Model Worker Management ----

function getNumIslands() {
  return Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
}

function getTopology() {
  return document.getElementById("topology").value;
}

// Fitness-weighted selection: pick from candidates, biased toward higher similarity
function selectSource(candidates) {
  const valid = candidates.filter((i) => islandState[i] && islandState[i].polygons);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  // Tournament of 2: pick two random candidates, return the fitter one
  // (with 30% chance of picking the worse one for diversity)
  const a = valid[Math.floor(Math.random() * valid.length)];
  let b = valid[Math.floor(Math.random() * valid.length)];
  while (b === a && valid.length > 1) b = valid[Math.floor(Math.random() * valid.length)];

  const simA = islandState[a].similarity;
  const simB = islandState[b].similarity;
  const better = simA >= simB ? a : b;
  const worse = simA >= simB ? b : a;

  return Math.random() < 0.7 ? better : worse;
}

function migrate() {
  if (workers.length < 2) return;

  const topology = getTopology();
  const n = workers.length;

  for (let i = 0; i < n; i++) {
    const neighbors = migViz.getNeighbors(i);
    const source = selectSource(neighbors);
    if (source === null) continue;

    workers[i].postMessage({ type: "migrate", polygons: islandState[source].polygons });
    migViz.addMigration(source, i);
  }
}

function spawnIslands() {
  killIslands();

  const { data, width, height } = getWorkImageData();
  const config = getConfig();
  const numIslands = getNumIslands();
  const topology = getTopology();
  const migrationInterval = 5000;

  benchmark.startRun({ ...config, islands: numIslands, topology });
  migViz.reset(topology, numIslands);

  islandState = new Array(numIslands).fill(null);
  globalBest = null;

  for (let i = 0; i < numIslands; i++) {
    const w = new Worker("ga-worker.js");

    w.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "update") {
        islandState[i] = {
          generation: msg.generation,
          similarity: msg.similarity,
          polygons: msg.polygons,
        };
        migViz.updateIsland(i, msg.similarity);

        if (!globalBest || msg.similarity > globalBest.similarity) {
          globalBest = { similarity: msg.similarity, polygons: msg.polygons };
          renderPolygons(msg.polygons);
        }
        updateStats();
      }
    };

    w.postMessage({
      type: "start",
      imageData: data.buffer.slice(0),
      width,
      height,
      config,
    });

    workers.push(w);
  }

  islandsEl.textContent = numIslands;
  startTime = Date.now();
  migrationTimer = setInterval(migrate, migrationInterval);
}

function killIslands() {
  if (migrationTimer) {
    clearInterval(migrationTimer);
    migrationTimer = null;
  }
  for (const w of workers) w.terminate();
  workers = [];
  benchmark.stopRun();
}

function updateStats() {
  let totalGens = 0;
  for (const s of islandState) if (s) totalGens += s.generation;
  genCountEl.textContent = totalGens.toLocaleString();

  if (globalBest) {
    similarityEl.textContent = globalBest.similarity + "%";
    benchmark.record(totalGens, globalBest.similarity);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed > 0) {
    gpsEl.textContent = Math.round(totalGens / elapsed);
  }

  migViz.draw();
}

// ---- Rendering ----

function renderPolygons(polygons) {
  const ctx = outputCanvas.getContext("2d");
  const w = outputCanvas.width;
  const h = outputCanvas.height;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  for (const poly of polygons) {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x * w, poly.points[0].y * h);
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x * w, poly.points[i].y * h);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${poly.r},${poly.g},${poly.b},${poly.a})`;
    ctx.fill();
  }
}

// ---- Stats ----

function resetStats() {
  genCountEl.textContent = "0";
  similarityEl.textContent = "\u2014";
  gpsEl.textContent = "\u2014";
  islandsEl.textContent = "\u2014";
}

// ---- Controls ----

startBtn.addEventListener("click", () => {
  spawnIslands();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  killIslands();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = !globalBest;
});

resetBtn.addEventListener("click", () => {
  killIslands();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = true;
  globalBest = null;
  const ctx = outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  resetStats();
});

newImageBtn.addEventListener("click", () => {
  killIslands();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = true;
  globalBest = null;
  workspace.classList.add("hidden");
  dropZone.classList.remove("hidden");
  fileInput.value = "";
  referenceImage = null;
});

downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "squint-art.png";
  link.href = outputCanvas.toDataURL("image/png");
  link.click();
});

// ---- Benchmark controls ----

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    benchmark.setXAxis(btn.dataset.axis);
  });
});

document.getElementById("export-btn").addEventListener("click", () => {
  const json = benchmark.exportData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "polygon-ga-benchmark.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clear-chart-btn").addEventListener("click", () => {
  benchmark.clearRuns();
});

window.addEventListener("resize", () => {
  benchmark.resize();
  migViz.resize();
});
