// Chart canvas renderer — draws benchmark data onto a canvas.

const COLORS = [
  "#7c6aef", "#ef6a7c", "#6aef7c", "#efcf6a",
  "#6acfef", "#cf6aef", "#ef9a6a", "#6a9aef",
];

export class ChartRenderer {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.data = data; // BenchmarkData instance
    this.xAxis = "generation";
    this._lastDraw = 0;
    this._throttle = 300;
    this._pending = false;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    if (w === 0) return;
    this.canvas.width = w;
    this.canvas.height = 220;
    this.draw();
  }

  setXAxis(axis) {
    this.xAxis = axis;
    this.draw();
  }

  scheduleDraw() {
    if (this._pending) return;
    const gap = performance.now() - this._lastDraw;
    if (gap >= this._throttle) {
      this.draw();
    } else {
      this._pending = true;
      setTimeout(() => {
        this._pending = false;
        this.draw();
      }, this._throttle - gap);
    }
  }

  draw() {
    this._lastDraw = performance.now();
    const { canvas, ctx, xAxis } = this;
    const runs = this.data.runs;
    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;

    const pad = { top: 15, right: 20, bottom: 35, left: 55 };
    const pw = W - pad.left - pad.right;
    const ph = H - pad.top - pad.bottom;

    ctx.fillStyle = "#141416";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "#2a2a2e";
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, pw, ph);

    // X range
    let xMax = 0;
    for (const run of runs) {
      if (run.points.length === 0) continue;
      const last = run.points[run.points.length - 1];
      const v = xAxis === "generation" ? last.gen : last.time;
      if (v > xMax) xMax = v;
    }
    if (xMax === 0) xMax = xAxis === "generation" ? 100 : 10;

    // Auto-scale Y
    let yMin = Infinity, yMax = -Infinity;
    for (const run of runs) {
      for (const p of run.points) {
        if (p.similarity < yMin) yMin = p.similarity;
        if (p.similarity > yMax) yMax = p.similarity;
      }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 100; }

    const yRange = yMax - yMin || 1;
    const yStep = this._niceStep(yRange, 6);
    yMin = Math.max(0, Math.floor(yMin / yStep) * yStep);
    yMax = Math.min(100, Math.ceil(yMax / yStep) * yStep);
    if (yMax - yMin < yStep) yMax = Math.min(100, yMin + yStep);
    const ySpan = yMax - yMin;

    // Grid
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 0.5;
    ctx.font = "10px -apple-system, sans-serif";

    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let y = yMin; y <= yMax; y += yStep) {
      const py = pad.top + ph * (1 - (y - yMin) / ySpan);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(pad.left + pw, py);
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.fillText(y.toFixed(yStep < 1 ? 1 : 0) + "%", pad.left - 6, py);
    }

    const xStep = this._niceStep(xMax, 8);
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (let x = 0; x <= xMax; x += xStep) {
      const px = pad.left + pw * (x / xMax);
      ctx.beginPath();
      ctx.moveTo(px, pad.top);
      ctx.lineTo(px, pad.top + ph);
      ctx.stroke();
      ctx.fillStyle = "#555";
      ctx.fillText(
        xAxis === "generation" ? this._fmtNum(x) : x.toFixed(1) + "s",
        px, pad.top + ph + 6,
      );
    }
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "#444";
    ctx.font = "11px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(xAxis === "generation" ? "Generation" : "Time (s)", pad.left + pw / 2, H - 4);

    ctx.save();
    ctx.translate(12, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "top";
    ctx.fillText("Similarity", 0, 0);
    ctx.restore();

    // Data lines
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.points.length < 2) continue;
      ctx.strokeStyle = COLORS[r % COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < run.points.length; i++) {
        const p = run.points[i];
        const xVal = xAxis === "generation" ? p.gen : p.time;
        const px = pad.left + pw * (xVal / xMax);
        const py = pad.top + ph * (1 - (p.similarity - yMin) / ySpan);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Legend
    if (runs.length > 0) {
      const lx = pad.left + 10;
      let ly = pad.top + 8;
      ctx.font = "10px -apple-system, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (let r = 0; r < runs.length; r++) {
        const run = runs[r];
        const color = COLORS[r % COLORS.length];
        const pts = run.points;
        const lastSim = pts.length > 0 ? pts[pts.length - 1].similarity.toFixed(1) + "%" : "-";

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 16, ly);
        ctx.stroke();

        ctx.fillStyle = "#999";
        const tag = `${run.config.numPolygons}p / pop${run.config.populationSize}`;
        ctx.fillText(`${run.label} (${tag}) \u2014 ${lastSim}`, lx + 22, ly);
        ly += 15;
      }
    }

    // Empty state
    if (runs.length === 0) {
      ctx.fillStyle = "#333";
      ctx.font = "13px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Run the GA to see performance data", W / 2, H / 2);
    }
  }

  _niceStep(range, ticks) {
    if (range <= 0) return 1;
    const rough = range / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const r = rough / mag;
    const nice = r <= 1.5 ? 1 : r <= 3 ? 2 : r <= 7 ? 5 : 10;
    return Math.max(1, nice * mag);
  }

  _fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  }
}
