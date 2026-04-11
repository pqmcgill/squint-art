// GIF mode — decode GIF into frames, run GA on each, encode output GIF.

// ── GIF Playback ──

class GifPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._rendered = []; // pre-rendered { canvas, delay }
    this.index = 0;
    this._timer = null;
  }

  // Accept frames as { source (ImageData or Canvas), delay }
  // Pre-renders everything to canvas elements at display size for fast playback.
  setFrames(frames, displayW, displayH) {
    this.stop();
    this.canvas.width = displayW;
    this.canvas.height = displayH;
    this._rendered = frames.map((f) => {
      const c = document.createElement("canvas");
      c.width = displayW;
      c.height = displayH;
      const cctx = c.getContext("2d");
      if (f.source instanceof ImageData) {
        const tmp = document.createElement("canvas");
        tmp.width = f.source.width;
        tmp.height = f.source.height;
        tmp.getContext("2d").putImageData(f.source, 0, 0);
        cctx.drawImage(tmp, 0, 0, displayW, displayH);
      } else {
        cctx.drawImage(f.source, 0, 0, displayW, displayH);
      }
      return { canvas: c, delay: f.delay };
    });
    this.index = 0;
    if (this._rendered.length > 0) this._drawFrame(0);
  }

  play() {
    if (this._rendered.length < 2) return;
    this.stop();
    this._scheduleNext();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _drawFrame(i) {
    const frame = this._rendered[i];
    if (!frame) return;
    this.ctx.drawImage(frame.canvas, 0, 0);
  }

  _scheduleNext() {
    const frame = this._rendered[this.index];
    if (!frame) return;
    this._timer = setTimeout(() => {
      this.index = (this.index + 1) % this._rendered.length;
      this._drawFrame(this.index);
      this._scheduleNext();
    }, frame.delay);
  }
}

// ── GIF Processor ──

class GifProcessor {
  constructor() {
    this.frames = [];       // { imageData, delay }
    this.outputFrames = []; // { canvas, delay } per frame
    this.width = 0;
    this.height = 0;
    this.running = false;
    this.onProgress = null; // (frameIndex, totalFrames, polygons) => void
    this.onComplete = null; // (blob) => void
  }

  // ── Decode ──

  async decode(arrayBuffer) {
    const gif = gifuct.parseGIF(arrayBuffer);
    const rawFrames = gifuct.decompressFrames(gif, true);

    if (rawFrames.length === 0) throw new Error("No frames found in GIF");

    // GIF frames can have different sizes (partial updates).
    // Composite onto a full-size canvas to get complete frames.
    const w = gif.lsd.width;
    const h = gif.lsd.height;
    this.width = w;
    this.height = h;

    const compCanvas = document.createElement("canvas");
    compCanvas.width = w;
    compCanvas.height = h;
    const compCtx = compCanvas.getContext("2d");

    this.frames = [];
    for (const frame of rawFrames) {
      // Build ImageData for this frame's patch
      const patch = new ImageData(
        new Uint8ClampedArray(frame.patch),
        frame.dims.width,
        frame.dims.height,
      );

      // Handle disposal
      if (frame.disposalType === 2) {
        compCtx.clearRect(0, 0, w, h);
      }

      // Draw patch at the correct offset
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = frame.dims.width;
      tmpCanvas.height = frame.dims.height;
      tmpCanvas.getContext("2d").putImageData(patch, 0, 0);
      compCtx.drawImage(tmpCanvas, frame.dims.left, frame.dims.top);

      // Capture the full composited frame
      const fullFrame = compCtx.getImageData(0, 0, w, h);
      // gifuct-js returns delay in milliseconds already
      // Chrome treats delay <= 10ms as 100ms
      const delayMs = (frame.delay <= 10) ? 100 : frame.delay;
      this.frames.push({
        imageData: fullFrame,
        delay: delayMs,
      });
    }

    return { frameCount: this.frames.length, width: w, height: h };
  }

  // ── Process ──

  async process(config) {
    this.running = true;
    this.outputFrames = [];

    const {
      populationSize, numPolygons, numVertices, mutationRate,
      tournamentSize, fitDiv, subSample, generationsPerFrame, warmStart,
    } = config;

    const workRes = config.workRes || 128;
    const scale = Math.min(workRes / this.width, workRes / this.height, 1);
    const workW = Math.round(this.width * scale);
    const workH = Math.round(this.height * scale);

    // Scale each frame to work resolution
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = workW;
    tmpCanvas.height = workH;
    const tmpCtx = tmpCanvas.getContext("2d");

    let prevPolygons = null;

    for (let i = 0; i < this.frames.length; i++) {
      if (!this.running) break;

      const frame = this.frames[i];

      // Scale frame to work resolution
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = this.width;
      srcCanvas.height = this.height;
      srcCanvas.getContext("2d").putImageData(frame.imageData, 0, 0);
      tmpCtx.drawImage(srcCanvas, 0, 0, workW, workH);
      const workData = tmpCtx.getImageData(0, 0, workW, workH).data;

      // Run GA on this frame via a single worker
      const result = await this._runWorkerOnFrame(workData, workW, workH, {
        populationSize, numPolygons, numVertices, mutationRate,
        tournamentSize, fitDiv, subSample,
        maxGenerations: generationsPerFrame,
      }, warmStart && prevPolygons ? prevPolygons : null);

      if (!this.running) break;

      prevPolygons = result.polygons;

      // Render result at display resolution
      const outCanvas = document.createElement("canvas");
      outCanvas.width = this.width;
      outCanvas.height = this.height;
      const outCtx = outCanvas.getContext("2d");
      outCtx.fillStyle = "#000";
      outCtx.fillRect(0, 0, this.width, this.height);
      for (const poly of result.polygons) {
        outCtx.beginPath();
        outCtx.moveTo(poly.points[0].x * this.width, poly.points[0].y * this.height);
        for (let j = 1; j < poly.points.length; j++) {
          outCtx.lineTo(poly.points[j].x * this.width, poly.points[j].y * this.height);
        }
        outCtx.closePath();
        outCtx.fillStyle = `rgba(${poly.r},${poly.g},${poly.b},${poly.a})`;
        outCtx.fill();
      }
      this.outputFrames.push({
        canvas: outCanvas,
        delay: frame.delay,
      });

      if (this.onProgress) {
        this.onProgress(i + 1, this.frames.length, result.polygons);
      }
    }

    if (!this.running) return null;

    // Encode output GIF
    const blob = await this._encode();
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

  // ── Private ──

  _runWorkerOnFrame(imageData, width, height, config, warmStartPolygons) {
    return new Promise((resolve) => {
      const worker = new Worker("ga-worker.js");
      this._activeWorker = worker;

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "done") {
          worker.terminate();
          this._activeWorker = null;
          resolve({ polygons: msg.polygons, similarity: msg.similarity });
        }
      };

      const msg = {
        type: "start",
        imageData: imageData.buffer.slice(0),
        width,
        height,
        config,
      };
      if (warmStartPolygons) {
        msg.warmStart = warmStartPolygons;
      }
      worker.postMessage(msg);
    });
  }

  _encode() {
    return new Promise((resolve, reject) => {
      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: this.width,
        height: this.height,
        workerScript: "lib/gif.worker.js",
      });

      for (const frame of this.outputFrames) {
        gif.addFrame(frame.canvas, { delay: frame.delay, copy: true });
      }

      gif.on("finished", (blob) => resolve(blob));
      gif.on("error", (err) => reject(err));
      gif.render();
    });
  }
}
