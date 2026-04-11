// Main UI logic — image handling, worker management, rendering

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
const bestLabel = document.getElementById("best-label");
const chartCanvas = document.getElementById("chart-canvas");

const benchmark = new Benchmark(chartCanvas);

let worker = null;
let referenceImage = null;
let startTime = 0;

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

  // Chart canvas needs layout before it can size itself
  requestAnimationFrame(() => benchmark.resize());

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

// ---- Worker Management ----

function spawnWorker() {
  killWorker();

  const { data, width, height } = getWorkImageData();
  const config = getConfig();

  benchmark.startRun(config);

  worker = new Worker("ga-worker.js");

  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "update") {
      genCountEl.textContent = msg.generation.toLocaleString();
      similarityEl.textContent = msg.similarity + "%";

      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 0) {
        gpsEl.textContent = Math.round(msg.generation / elapsed);
      }

      renderPolygons(msg.polygons);
      benchmark.record(msg.generation, msg.similarity);
    }
  };

  // Transfer the underlying ArrayBuffer for zero-copy
  const buffer = data.buffer;
  worker.postMessage({ type: "start", imageData: buffer, width, height, config }, [buffer]);
  startTime = Date.now();
}

function killWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    benchmark.stopRun();
  }
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
}

// ---- Controls ----

startBtn.addEventListener("click", () => {
  spawnWorker();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  killWorker();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

resetBtn.addEventListener("click", () => {
  killWorker();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  const ctx = outputCanvas.getContext("2d");
  ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  resetStats();
});

newImageBtn.addEventListener("click", () => {
  killWorker();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  workspace.classList.add("hidden");
  dropZone.classList.remove("hidden");
  fileInput.value = "";
  referenceImage = null;
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

window.addEventListener("resize", () => benchmark.resize());
