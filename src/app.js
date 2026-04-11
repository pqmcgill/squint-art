// App controller — all DOM wiring. Imports everything, owns nothing.

import { IslandManager, getDefaultIslandCount } from "./ga/island-manager.js";
import { BenchmarkData } from "./chart/data.js";
import { ChartRenderer } from "./chart/renderer.js";
import { MigrationViz } from "./chart/migration-viz.js";
import { GifProcessor } from "./gif/processor.js";
import { GifPlayer } from "./gif/player.js";
import { renderPolygons } from "./render.js";

// ---- DOM refs ----

const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const workspace = document.getElementById("workspace");
const referenceCanvas = document.getElementById("reference-canvas");
const outputCanvas = document.getElementById("output-canvas");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const resetBtn = document.getElementById("reset-btn");
const downloadBtn = document.getElementById("download-btn");
const newImageBtn = document.getElementById("new-image-btn");
const genCountEl = document.getElementById("gen-count");
const similarityEl = document.getElementById("similarity-value");
const gpsEl = document.getElementById("gens-per-sec");
const islandsEl = document.getElementById("islands-value");
const chartCanvas = document.getElementById("chart-canvas");
const migrationCanvas = document.getElementById("migration-canvas");

const gifModal = document.getElementById("gif-modal");
const gifModalInfo = document.getElementById("gif-modal-info");
const gifConfirmBtn = document.getElementById("gif-confirm");
const gifCancelBtn = document.getElementById("gif-cancel");
const gifProgress = document.getElementById("gif-progress");
const gifProgressText = document.getElementById("gif-progress-text");
const gifProgressFill = document.getElementById("gif-progress-fill");
const gifCancelRunBtn = document.getElementById("gif-cancel-btn");

// ---- Services ----

const benchData = new BenchmarkData();
const chart = new ChartRenderer(chartCanvas, benchData);
const migViz = new MigrationViz(migrationCanvas);
const islands = new IslandManager();
const gifProcessor = new GifProcessor();
const refPlayer = new GifPlayer(referenceCanvas);
const outPlayer = new GifPlayer(outputCanvas);

let referenceImage = null;
let isGifMode = false;
let startTime = 0;

// ---- Helpers ----

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

function getTopology() {
  return document.getElementById("topology").value;
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
  tmp.getContext("2d").drawImage(img, 0, 0, w, h);
  return { data: tmp.getContext("2d").getImageData(0, 0, w, h).data, width: w, height: h };
}

function render(polygons) {
  renderPolygons(outputCanvas.getContext("2d"), outputCanvas.width, outputCanvas.height, polygons);
}

function resetStats() {
  genCountEl.textContent = "0";
  similarityEl.textContent = "\u2014";
  gpsEl.textContent = "\u2014";
  islandsEl.textContent = "\u2014";
}

function updateStats() {
  const totalGens = islands.totalGenerations();
  genCountEl.textContent = totalGens.toLocaleString();

  if (islands.globalBest) {
    similarityEl.textContent = islands.globalBest.similarity + "%";
    benchData.record(totalGens, islands.globalBest.similarity);
    chart.scheduleDraw();
  }

  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed > 0) gpsEl.textContent = Math.round(totalGens / elapsed);

  migViz.draw();
}

// ---- Drop Zone ----

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) handleFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
    handleGif(file);
  } else {
    loadStaticImage(file);
  }
}

// ---- Static Image Loading ----

function loadStaticImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      referenceImage = img;
      isGifMode = false;
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

  requestAnimationFrame(() => { chart.resize(); migViz.resize(); });
  resetStats();
}

// ---- Island Mode (static images) ----

islands.onUpdate = (i, msg) => {
  migViz.updateIsland(i, msg.similarity);
  if (islands.globalBest && msg.polygons === islands.globalBest.polygons) {
    render(msg.polygons);
  }
  updateStats();
};

function startIslands() {
  islands.kill();

  const { data, width, height } = getWorkImageData();
  const config = getConfig();
  const numIslands = getDefaultIslandCount();
  const topology = getTopology();

  benchData.startRun({ ...config, islands: numIslands, topology });
  migViz.reset(topology, numIslands);
  islandsEl.textContent = numIslands;
  startTime = Date.now();

  islands.spawn(data.buffer, width, height, config, numIslands, topology);
}

// ---- Controls ----

startBtn.addEventListener("click", () => {
  if (isGifMode) {
    gifModalInfo.textContent = `${gifProcessor.frames.length} frames at ${gifProcessor.width}x${gifProcessor.height}. This will run the GA on each frame sequentially.`;
    gifModal.classList.remove("hidden");
    return;
  }
  startIslands();
  startBtn.disabled = true;
  stopBtn.disabled = false;
});

stopBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = !islands.globalBest;
});

resetBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  refPlayer.stop();
  outPlayer.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = true;
  outputCanvas.getContext("2d").clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  resetStats();
});

newImageBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  refPlayer.stop();
  outPlayer.stop();
  gifProcessor.cancel();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  downloadBtn.disabled = true;
  isGifMode = false;
  workspace.classList.add("hidden");
  gifProgress.classList.add("hidden");
  dropZone.classList.remove("hidden");
  fileInput.value = "";
  referenceImage = null;
});

downloadBtn.addEventListener("click", () => {
  if (!isGifMode) {
    const link = document.createElement("a");
    link.download = "squint-art.png";
    link.href = outputCanvas.toDataURL("image/png");
    link.click();
  }
});

// ---- GIF Mode ----

async function handleGif(file) {
  const buf = await file.arrayBuffer();
  const info = gifProcessor.decode(buf);

  const maxDisplay = 400;
  const scale = Math.min(maxDisplay / info.width, maxDisplay / info.height, 1);
  const dw = Math.round(info.width * scale);
  const dh = Math.round(info.height * scale);

  const refFrames = gifProcessor.frames.map((f) => ({ source: f.imageData, delay: f.delay }));
  referenceCanvas.width = dw;
  referenceCanvas.height = dh;
  outputCanvas.width = dw;
  outputCanvas.height = dh;
  refPlayer.setFrames(refFrames, dw, dh);
  refPlayer.play();

  dropZone.classList.add("hidden");
  workspace.classList.remove("hidden");
  isGifMode = true;

  requestAnimationFrame(() => { chart.resize(); migViz.resize(); });
  resetStats();
}

gifConfirmBtn.addEventListener("click", () => {
  gifModal.classList.add("hidden");
  startGifProcessing();
});

gifCancelBtn.addEventListener("click", () => {
  gifModal.classList.add("hidden");
});

gifCancelRunBtn.addEventListener("click", () => {
  gifProcessor.cancel();
  gifProgress.classList.add("hidden");
  startBtn.disabled = false;
  refPlayer.play();
});

async function startGifProcessing() {
  const config = getConfig();
  config.generationsPerFrame = parseInt(document.getElementById("gif-gens").value);
  config.warmStart = document.getElementById("gif-warm").value === "1";
  config.workRes = parseInt(document.getElementById("work-res").value);

  refPlayer.stop();
  outPlayer.stop();

  startBtn.disabled = true;
  stopBtn.disabled = true;
  downloadBtn.disabled = true;
  gifProgress.classList.remove("hidden");
  gifProgressFill.style.width = "0%";
  gifProgressText.textContent = "Processing frame 0/" + gifProcessor.frames.length + "...";

  gifProcessor.onProgress = (frameIdx, total, polygons) => {
    gifProgressText.textContent = `Processing frame ${frameIdx}/${total}...`;
    gifProgressFill.style.width = ((frameIdx / total) * 100) + "%";
    render(polygons);

    const frame = gifProcessor.frames[frameIdx - 1];
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = gifProcessor.width;
    tmpCanvas.height = gifProcessor.height;
    tmpCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
    referenceCanvas.getContext("2d").drawImage(tmpCanvas, 0, 0, referenceCanvas.width, referenceCanvas.height);
  };

  gifProcessor.onComplete = (blob) => {
    gifProgress.classList.add("hidden");
    startBtn.disabled = false;

    const refFrames = gifProcessor.frames.map((f) => ({ source: f.imageData, delay: f.delay }));
    const outFrames = gifProcessor.outputFrames.map((f) => ({ source: f.canvas, delay: f.delay }));
    refPlayer.setFrames(refFrames, referenceCanvas.width, referenceCanvas.height);
    outPlayer.setFrames(outFrames, outputCanvas.width, outputCanvas.height);
    refPlayer.play();
    outPlayer.play();

    downloadBtn.disabled = false;
    downloadBtn.onclick = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "squint-art.gif";
      a.click();
      URL.revokeObjectURL(url);
    };
  };

  await gifProcessor.process(config);
}

// ---- Chart Controls ----

document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    chart.setXAxis(btn.dataset.axis);
  });
});

document.getElementById("export-btn").addEventListener("click", () => {
  const json = benchData.exportData();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "polygon-ga-benchmark.json";
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("clear-chart-btn").addEventListener("click", () => {
  benchData.clearRuns();
  chart.draw();
});

window.addEventListener("resize", () => { chart.resize(); migViz.resize(); });

// ---- Battery saver: pause workers when tab is hidden ----

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (islands.numIslands > 0 && !islands.paused) {
      islands.pause();
    }
  } else {
    if (islands.paused) {
      islands.resume(getTopology());
    }
  }
});
