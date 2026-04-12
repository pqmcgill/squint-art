// App controller — all DOM wiring. Imports everything, owns nothing.

import { BenchmarkData } from "./chart/data.js";
import { MigrationViz } from "./chart/migration-viz.js";
import { ChartRenderer } from "./chart/renderer.js";
import { getDefaultIslandCount, IslandManager } from "./ga/island-manager.js";
import { GifPlayer } from "./gif/player.js";
import { GifProcessor } from "./gif/processor.js";
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
const canvasPlayBtn = document.getElementById("canvas-play-btn");
const chartCanvas = document.getElementById("chart-canvas");
const migrationCanvas = document.getElementById("migration-canvas");

const gifModal = document.getElementById("gif-modal");
const gifModalInfo = document.getElementById("gif-modal-info");
const gifConfirmBtn = document.getElementById("gif-confirm");
const gifCancelBtn = document.getElementById("gif-cancel");
const gifProgress = document.getElementById("gif-progress");
const gifProgressFrame = document.getElementById("gif-progress-frame");
const gifProgressEta = document.getElementById("gif-progress-eta");
const gifProgressPct = document.getElementById("gif-progress-pct");
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

const monitorPanel = document.getElementById("monitor-panel");

let referenceImage = null;
let isGifMode = false;
let startTime = 0;

// Short-circuit: skip chart/viz work when panel is collapsed
function isMonitorOpen() {
  return monitorPanel.open;
}

// ---- Helpers ----

function getConfig() {
  return {
    populationSize: parseInt(document.getElementById("pop-size").value, 10),
    numPolygons: parseInt(document.getElementById("num-polygons").value, 10),
    numVertices: parseInt(document.getElementById("num-vertices").value, 10),
    mutationRate: parseFloat(document.getElementById("mutation-rate").value),
    tournamentSize: parseInt(
      document.getElementById("tournament-size").value,
      10,
    ),
    fitDiv: parseInt(document.getElementById("fit-div").value, 10),
    subSample: parseInt(document.getElementById("sub-sample").value, 10),
  };
}

function getTopology() {
  return document.getElementById("topology").value;
}

function getWorkImageData() {
  const workRes = parseInt(document.getElementById("work-res").value, 10);
  const img = referenceImage;
  const scale = Math.min(workRes / img.width, workRes / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  tctx.drawImage(img, 0, 0, w, h);
  return {
    data: tctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
  };
}

function render(polygons) {
  renderPolygons(
    outputCanvas.getContext("2d"),
    outputCanvas.width,
    outputCanvas.height,
    polygons,
  );
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
    similarityEl.textContent = `${islands.globalBest.similarity}%`;

    // Only record + render chart/viz when the panel is open
    if (isMonitorOpen()) {
      benchData.record(totalGens, islands.globalBest.similarity);
      chart.scheduleDraw();
      migViz.draw();
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  if (elapsed > 0) gpsEl.textContent = Math.round(totalGens / elapsed);
}

// ---- Drop Zone ----

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("drag-over"),
);
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith("image/")) handleFile(file);
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

  requestAnimationFrame(() => {
    chart.resize();
    migViz.resize();
  });
  canvasPlayBtn.classList.remove("hidden");
  showControls(startBtn, newImageBtn);
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

// Show only the buttons relevant to the current state.
// States: idle (image loaded, not started), running, stopped (has output)
const allBtns = [startBtn, stopBtn, resetBtn, downloadBtn, newImageBtn];

function showControls(...btns) {
  for (const b of allBtns) {
    b.classList.toggle("hidden", !btns.includes(b));
    b.disabled = false;
  }
}

function triggerStart() {
  if (isGifMode) {
    gifModalInfo.textContent = `${gifProcessor.frames.length} frames at ${gifProcessor.width}x${gifProcessor.height}. This will run the GA on each frame sequentially.`;
    gifModal.classList.remove("hidden");
    return;
  }
  canvasPlayBtn.classList.add("hidden");
  startIslands();
  showControls(stopBtn);
}

startBtn.addEventListener("click", triggerStart);
canvasPlayBtn.addEventListener("click", triggerStart);

stopBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  showControls(startBtn, resetBtn, downloadBtn, newImageBtn);
});

resetBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  refPlayer.stop();
  outPlayer.stop();
  outputCanvas
    .getContext("2d")
    .clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  canvasPlayBtn.classList.remove("hidden");
  showControls(startBtn, newImageBtn);
  resetStats();
});

newImageBtn.addEventListener("click", () => {
  islands.kill();
  benchData.stopRun();
  refPlayer.stop();
  outPlayer.stop();
  gifProcessor.cancel();
  isGifMode = false;
  workspace.classList.add("hidden");
  gifProgress.classList.add("hidden");
  document.getElementById("controls-buttons").classList.remove("hidden");
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

  const refFrames = gifProcessor.frames.map((f) => ({
    source: f.imageData,
    delay: f.delay,
  }));
  referenceCanvas.width = dw;
  referenceCanvas.height = dh;
  outputCanvas.width = dw;
  outputCanvas.height = dh;
  refPlayer.setFrames(refFrames, dw, dh);
  refPlayer.play();

  dropZone.classList.add("hidden");
  workspace.classList.remove("hidden");
  isGifMode = true;

  requestAnimationFrame(() => {
    chart.resize();
    migViz.resize();
  });
  canvasPlayBtn.classList.remove("hidden");
  showControls(startBtn, newImageBtn);
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
  document.getElementById("controls-buttons").classList.remove("hidden");
  showControls(startBtn, newImageBtn);
  refPlayer.play();
});

async function startGifProcessing() {
  canvasPlayBtn.classList.add("hidden");
  const config = getConfig();
  config.generationsPerFrame = parseInt(
    document.getElementById("gif-gens").value,
    10,
  );
  config.warmStart = document.getElementById("gif-warm").value === "1";
  config.workRes = parseInt(document.getElementById("work-res").value, 10);

  refPlayer.stop();
  outPlayer.stop();

  document.getElementById("controls-buttons").classList.add("hidden");
  gifProgress.classList.remove("hidden");
  gifProgressFill.style.width = "0%";
  gifProgressFrame.textContent = `Generating frame 0 / ${gifProcessor.frames.length}`;
  gifProgressEta.textContent = "";
  gifProgressPct.textContent = "";

  const gifStartTime = Date.now();

  gifProcessor.onProgress = (frameIdx, total, polygons) => {
    const pct = Math.round((frameIdx / total) * 100);
    gifProgressFrame.textContent = `Generating frame ${frameIdx} / ${total}`;
    gifProgressFill.style.width = `${pct}%`;
    gifProgressPct.textContent = `${pct}%`;

    // ETA
    const elapsed = (Date.now() - gifStartTime) / 1000;
    const perFrame = elapsed / frameIdx;
    const remaining = Math.round(perFrame * (total - frameIdx));
    if (remaining > 60) {
      gifProgressEta.textContent = `~${Math.round(remaining / 60)}m left`;
    } else {
      gifProgressEta.textContent = `~${remaining}s left`;
    }

    render(polygons);

    const frame = gifProcessor.frames[frameIdx - 1];
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = gifProcessor.width;
    tmpCanvas.height = gifProcessor.height;
    tmpCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
    referenceCanvas
      .getContext("2d")
      .drawImage(
        tmpCanvas,
        0,
        0,
        referenceCanvas.width,
        referenceCanvas.height,
      );
  };

  gifProcessor.onComplete = (blob) => {
    gifProgress.classList.add("hidden");
    document.getElementById("controls-buttons").classList.remove("hidden");
    showControls(startBtn, downloadBtn, newImageBtn);

    const refFrames = gifProcessor.frames.map((f) => ({
      source: f.imageData,
      delay: f.delay,
    }));
    const outFrames = gifProcessor.outputFrames.map((f) => ({
      source: f.canvas,
      delay: f.delay,
    }));
    refPlayer.setFrames(
      refFrames,
      referenceCanvas.width,
      referenceCanvas.height,
    );
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
    document.querySelectorAll(".toggle-btn").forEach((b) => {
      b.classList.remove("active");
    });
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

window.addEventListener("resize", () => {
  if (isMonitorOpen()) {
    chart.resize();
    migViz.resize();
  }
});

// Resize chart/viz when the monitor panel opens
monitorPanel.addEventListener("toggle", () => {
  if (monitorPanel.open) {
    requestAnimationFrame(() => {
      chart.resize();
      migViz.resize();
    });
  }
});

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
