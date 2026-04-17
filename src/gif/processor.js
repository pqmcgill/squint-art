// GIF processor — orchestrates decode → per-frame GA → encode.

import { detectBackgroundColor } from "../background.js";
import { getShape } from "../ga/shapes.js";
import { renderPolygons } from "../render.js";
import { decodeGif } from "./decoder.js";
import { encodeGif } from "./encoder.js";

// Resolve the background for a single GIF frame: auto-detect when enabled,
// otherwise fall back to the user-picked color (or black).
export function resolveFrameBackground(workData, w, h, config) {
  if (config.autoBackground) {
    return detectBackgroundColor(workData, w, h);
  }
  return config.background || "#000";
}

export class GifProcessor {
  constructor() {
    this.frames = [];
    this.outputFrames = [];
    this.width = 0;
    this.height = 0;
    this.running = false;
    this.onProgress = null;
    this.onComplete = null;
    this._activeWorker = null;
  }

  decode(arrayBuffer) {
    const { frames, width, height } = decodeGif(arrayBuffer);
    this.frames = frames;
    this.width = width;
    this.height = height;
    return { frameCount: frames.length, width, height };
  }

  async process(config) {
    this.running = true;
    this.outputFrames = [];

    const {
      populationSize,
      numPolygons,
      numVertices,
      mutationRate,
      tournamentSize,
      fitDiv,
      subSample,
      generationsPerFrame,
      warmStart,
      autoBackground,
    } = config;

    const workRes = config.workRes || 128;
    const scale = Math.min(workRes / this.width, workRes / this.height, 1);
    const workW = Math.round(this.width * scale);
    const workH = Math.round(this.height * scale);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = workW;
    tmpCanvas.height = workH;
    const tmpCtx = tmpCanvas.getContext("2d");

    let prevPolygons = null;

    for (let i = 0; i < this.frames.length; i++) {
      if (!this.running) break;

      const frame = this.frames[i];

      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = this.width;
      srcCanvas.height = this.height;
      srcCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
      tmpCtx.drawImage(srcCanvas, 0, 0, workW, workH);
      const workData = tmpCtx.getImageData(0, 0, workW, workH).data;

      // Auto-detect background per frame so GIFs with changing scenes (fades,
      // scene cuts, moving cameras) keep their polygon budget on detail.
      const frameBg = resolveFrameBackground(workData, workW, workH, {
        autoBackground,
        background: config.background,
      });

      const result = await this._runWorkerOnFrame(
        workData,
        workW,
        workH,
        {
          populationSize,
          numPolygons,
          numVertices,
          mutationRate,
          tournamentSize,
          fitDiv,
          subSample,
          maxGenerations: generationsPerFrame,
          background: frameBg,
          shape: config.shape,
        },
        warmStart && prevPolygons ? prevPolygons : null,
      );

      if (!this.running) break;

      prevPolygons = result.polygons;

      // Render at original resolution
      const outCanvas = document.createElement("canvas");
      outCanvas.width = this.width;
      outCanvas.height = this.height;
      renderPolygons(
        outCanvas.getContext("2d"),
        this.width,
        this.height,
        result.polygons,
        frameBg,
        getShape(config.shape),
      );
      this.outputFrames.push({ canvas: outCanvas, delay: frame.delay });

      if (this.onProgress)
        this.onProgress(i + 1, this.frames.length, result.polygons, frameBg);
    }

    if (!this.running) return null;

    const blob = await encodeGif(this.outputFrames, this.width, this.height);
    if (this.onComplete) this.onComplete(blob);
    return blob;
  }

  cancel() {
    this.running = false;
    if (this._activeWorker) {
      this._activeWorker.terminate();
      this._activeWorker = null;
    }
  }

  _runWorkerOnFrame(imageData, width, height, config, warmStartPolygons) {
    return new Promise((resolve) => {
      // Worker URL resolved by bun bundler
      const worker = new Worker("dist/worker.js");
      this._activeWorker = worker;

      worker.onmessage = (e) => {
        if (e.data.type === "done") {
          worker.terminate();
          this._activeWorker = null;
          resolve({ polygons: e.data.polygons, similarity: e.data.similarity });
        }
      };

      const msg = {
        type: "start",
        imageData: imageData.buffer.slice(0),
        width,
        height,
        config,
      };
      if (warmStartPolygons) msg.warmStart = warmStartPolygons;
      worker.postMessage(msg);
    });
  }
}
