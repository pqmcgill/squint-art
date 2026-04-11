// Migration topology visualization — island nodes with animated migration arcs.

import { TOPOLOGIES } from "../ga/topology.js";

export class MigrationViz {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.topology = "ring";
    this.numIslands = 0;
    this.islandSimilarity = [];
    this.migrations = [];
    this._animating = false;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    if (w === 0) return;
    const size = Math.min(w, 240);
    this.canvas.width = size;
    this.canvas.height = size;
    this.draw();
  }

  reset(topology, numIslands) {
    this.topology = topology;
    this.numIslands = numIslands;
    this.islandSimilarity = new Array(numIslands).fill(null);
    this.migrations = [];
    this.draw();
  }

  updateIsland(index, similarity) {
    this.islandSimilarity[index] = similarity;
  }

  addMigration(from, to) {
    this.migrations.push({ from, to, time: performance.now() });
    this._startAnimation();
  }

  getNeighbors(i) {
    const topo = TOPOLOGIES[this.topology];
    return topo ? topo.neighbors(i, this.numIslands) : [];
  }

  // ---- Rendering ----

  _nodePositions() {
    const n = this.numIslands;
    if (n === 0) return [];
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    if (this.topology === "grid") {
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const padX = 35, padY = 30;
      const cellW = cols > 1 ? (w - padX * 2) / (cols - 1) : 0;
      const cellH = rows > 1 ? (h - padY * 2 - 15) / (rows - 1) : 0;
      const offX = cols === 1 ? cx : padX;
      const offY = rows === 1 ? cy : padY;
      return Array.from({ length: n }, (_, i) => ({
        x: offX + (i % cols) * cellW,
        y: offY + Math.floor(i / cols) * cellH,
      }));
    }

    const r = Math.min(cx, cy) - 32;
    return Array.from({ length: n }, (_, i) => ({
      x: cx + r * Math.cos((i / n) * Math.PI * 2 - Math.PI / 2),
      y: cy + r * Math.sin((i / n) * Math.PI * 2 - Math.PI / 2),
    }));
  }

  draw() {
    const { canvas, ctx } = this;
    const w = canvas.width;
    const h = canvas.height;
    const now = performance.now();

    this.migrations = this.migrations.filter((m) => now - m.time < 2000);

    ctx.fillStyle = "#141416";
    ctx.fillRect(0, 0, w, h);

    if (this.numIslands === 0) {
      ctx.fillStyle = "#333";
      ctx.font = "12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No islands", w / 2, h / 2);
      return;
    }

    const pos = this._nodePositions();
    const topo = TOPOLOGIES[this.topology];
    const nodeR = this.numIslands > 12 ? 7 : 10;

    // Topology edges
    ctx.strokeStyle = "#1e1e22";
    ctx.lineWidth = 1;
    const drawn = new Set();
    for (let i = 0; i < this.numIslands; i++) {
      for (const j of topo.neighbors(i, this.numIslands)) {
        const key = Math.min(i, j) + ":" + Math.max(i, j);
        if (drawn.has(key)) continue;
        drawn.add(key);
        ctx.beginPath();
        ctx.moveTo(pos[i].x, pos[i].y);
        ctx.lineTo(pos[j].x, pos[j].y);
        ctx.stroke();
      }
    }

    // Migration arcs
    for (const m of this.migrations) {
      const age = now - m.time;
      const alpha = Math.max(0, 1 - age / 2000);
      if (alpha <= 0) continue;

      const from = pos[m.from];
      const to = pos[m.to];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const angle = Math.atan2(dy, dx);
      const t = Math.min(1, age / 800);
      const dotX = from.x + dx * t;
      const dotY = from.y + dy * t;

      ctx.strokeStyle = `rgba(124, 106, 239, ${alpha * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x + Math.cos(angle) * nodeR, from.y + Math.sin(angle) * nodeR);
      ctx.lineTo(dotX, dotY);
      ctx.stroke();

      if (t < 1) {
        ctx.fillStyle = `rgba(124, 106, 239, ${alpha})`;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (t >= 1) {
        const flash = Math.max(0, 1 - (age - 800) / 1200);
        ctx.strokeStyle = `rgba(124, 106, 239, ${flash * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(to.x, to.y, nodeR + 4 + (1 - flash) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Nodes
    for (let i = 0; i < this.numIslands; i++) {
      const { x, y } = pos[i];
      const sim = this.islandSimilarity[i];

      let color = "#2a2a2e";
      if (sim !== null) {
        const sims = this.islandSimilarity.filter((s) => s !== null);
        const lo = Math.min(...sims);
        const hi = Math.max(...sims);
        const range = hi - lo || 1;
        const t = (sim - lo) / range;
        const r = Math.round(60 + 80 * (1 - t));
        const g = Math.round(80 + 150 * t);
        color = `rgb(${r},${g},90)`;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, nodeR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ddd";
      ctx.font = `${nodeR > 7 ? 9 : 7}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), x, y);

      if (sim !== null && nodeR > 7) {
        ctx.fillStyle = "#666";
        ctx.font = "8px -apple-system, sans-serif";
        ctx.textBaseline = "bottom";
        ctx.fillText(sim.toFixed(1) + "%", x, y - nodeR - 3);
      }
    }

    // Label
    ctx.fillStyle = "#444";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      topo.label + " \u00b7 " + this.numIslands + " islands",
      w / 2, h - 4,
    );
  }

  _startAnimation() {
    if (this._animating) return;
    this._animating = true;
    const loop = () => {
      this.draw();
      if (this.migrations.length > 0) {
        requestAnimationFrame(loop);
      } else {
        this._animating = false;
      }
    };
    requestAnimationFrame(loop);
  }
}
