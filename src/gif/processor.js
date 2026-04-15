// GIF processor — orchestrates decode → per-frame GA → encode.

import { decodeGif } from "./decoder.js";
import { encodeGif } from "./encoder.js";

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
        },
        warmStart && prevPolygons ? prevPolygons : null,
      );

      if (!this.running) break;

      prevPolygons = result.polygons;

      // Render at original resolution
      const outCanvas = document.createElement("canvas");
      outCanvas.width = this.width;
      outCanvas.height = this.height;
      const outCtx = outCanvas.getContext("2d");
      outCtx.fillStyle = config.background || "#000";
      outCtx.fillRect(0, 0, this.width, this.height);
      for (const poly of result.polygons) {
        outCtx.beginPath();
        outCtx.moveTo(
          poly.points[0].x * this.width,
          poly.points[0].y * this.height,
        );
        for (let j = 1; j < poly.points.length; j++) {
          outCtx.lineTo(
            poly.points[j].x * this.width,
            poly.points[j].y * this.height,
          );
        }
        outCtx.closePath();
        outCtx.fillStyle = `rgba(${poly.r},${poly.g},${poly.b},${poly.a})`;
        outCtx.fill();
      }
      this.outputFrames.push({ canvas: outCanvas, delay: frame.delay });

      if (this.onProgress)
        this.onProgress(i + 1, this.frames.length, result.polygons);
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
