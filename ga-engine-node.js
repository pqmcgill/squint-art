// Shared GA engine for Node.js — used by both bench.js and bench-worker.js.
// Requires @napi-rs/canvas createCanvas and a loaded Wasm instance to be injected.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class GA {
  constructor(refData, w, h, cfg, createCanvas, wasmInstance) {
    this.refData = refData;
    this.w = w;
    this.h = h;
    this.cfg = cfg;
    this.wasm = wasmInstance;

    // Full-res canvas
    this.canvas = createCanvas(w, h);
    this.ctx = this.canvas.getContext("2d");

    // Reduced-resolution fitness canvas
    const fitDiv = cfg.fitDiv || 1;
    this.fitW = Math.max(1, Math.round(w / fitDiv));
    this.fitH = Math.max(1, Math.round(h / fitDiv));
    this.fitPixelLen = this.fitW * this.fitH * 4;
    this.fitCanvas = createCanvas(this.fitW, this.fitH);
    this.fitCtx = this.fitCanvas.getContext("2d");

    // Scale reference to fitness resolution
    const tmpCanvas = createCanvas(w, h);
    const tmpCtx = tmpCanvas.getContext("2d");
    const tmpImg = tmpCtx.createImageData(w, h);
    tmpImg.data.set(refData);
    tmpCtx.putImageData(tmpImg, 0, 0);
    this.fitCtx.drawImage(tmpCanvas, 0, 0, this.fitW, this.fitH);
    const fitRefData = this.fitCtx.getImageData(0, 0, this.fitW, this.fitH).data;

    // Wasm memory
    const mem = wasmInstance.exports.memory;
    const needed = 2 * this.fitPixelLen;
    if (needed > mem.buffer.byteLength) {
      mem.grow(Math.ceil((needed - mem.buffer.byteLength) / 65536));
    }
    this.wasmBuf = new Uint8Array(mem.buffer);
    this.wasmBuf.set(fitRefData, this.fitPixelLen);

    this.population = [];
    this.fitnesses = [];
    this.bestFitness = Infinity;
    this.bestIndividual = null;
    this.generation = 0;
    this._initPopulation();
  }

  static _polyFill(p) {
    p.fill = `rgba(${p.r},${p.g},${p.b},${p.a})`;
    return p;
  }

  _randomPolygon() {
    const nv = this.cfg.numVertices;
    const cx = Math.random();
    const cy = Math.random();
    const radius = Math.random() * 0.15 + 0.02;
    const start = Math.random() * Math.PI * 2;
    const points = [];
    for (let i = 0; i < nv; i++) {
      const a = start + (i / nv) * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      points.push({
        x: clamp(cx + Math.cos(a) * r, 0, 1),
        y: clamp(cy + Math.sin(a) * r, 0, 1),
      });
    }
    return GA._polyFill({
      points,
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
      a: Math.random() * 0.4 + 0.05,
    });
  }

  _clonePoly(p) {
    return {
      points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
      r: p.r, g: p.g, b: p.b, a: p.a,
      fill: p.fill,
    };
  }

  _cloneInd(ind) {
    return { polygons: ind.polygons.map((p) => this._clonePoly(p)) };
  }

  _createIndividual() {
    const polys = [];
    for (let i = 0; i < this.cfg.numPolygons; i++) polys.push(this._randomPolygon());
    return { polygons: polys };
  }

  _initPopulation() {
    this.population = [];
    this.fitnesses = [];
    for (let i = 0; i < this.cfg.populationSize; i++) {
      this.population.push(this._createIndividual());
      this.fitnesses.push(Infinity);
    }
  }

  _renderTo(ind, c, w, h) {
    c.fillStyle = "#000";
    c.fillRect(0, 0, w, h);
    for (const poly of ind.polygons) {
      c.beginPath();
      c.moveTo(poly.points[0].x * w, poly.points[0].y * h);
      for (let j = 1; j < poly.points.length; j++) {
        c.lineTo(poly.points[j].x * w, poly.points[j].y * h);
      }
      c.closePath();
      c.fillStyle = poly.fill;
      c.fill();
    }
  }

  _fitness(ind) {
    this._renderTo(ind, this.fitCtx, this.fitW, this.fitH);
    const data = this.fitCtx.getImageData(0, 0, this.fitW, this.fitH).data;
    this.wasmBuf.set(data, 0);
    return this.wasm.exports.pixel_diff(this.fitPixelLen, 4);
  }

  fullSimilarity() {
    this._renderTo(this.bestIndividual, this.ctx, this.w, this.h);
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data;
    const ref = this.refData;
    let diff = 0;
    for (let i = 0, len = d.length; i < len; i += 4) {
      const dr = d[i] - ref[i];
      const dg = d[i + 1] - ref[i + 1];
      const db = d[i + 2] - ref[i + 2];
      diff += dr * dr + dg * dg + db * db;
    }
    return (1 - diff / (this.w * this.h * 255 * 255 * 3)) * 100;
  }

  _tournamentSelect() {
    let best = Math.floor(Math.random() * this.population.length);
    for (let i = 1; i < this.cfg.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * this.population.length);
      if (this.fitnesses[idx] < this.fitnesses[best]) best = idx;
    }
    return this.population[best];
  }

  _crossover(p1, p2) {
    const child = { polygons: [] };
    for (let i = 0; i < p1.polygons.length; i++) {
      const src = Math.random() < 0.5 ? p1 : p2;
      child.polygons.push(this._clonePoly(src.polygons[i]));
    }
    return child;
  }

  _mutate(ind) {
    const mr = this.cfg.mutationRate;
    for (let i = 0; i < ind.polygons.length; i++) {
      if (Math.random() < mr * 0.1) {
        ind.polygons[i] = this._randomPolygon();
        continue;
      }
      const poly = ind.polygons[i];
      for (const pt of poly.points) {
        if (Math.random() < mr) {
          pt.x = clamp(pt.x + gaussianRandom() * 0.05, 0, 1);
          pt.y = clamp(pt.y + gaussianRandom() * 0.05, 0, 1);
        }
      }
      let cc = false;
      if (Math.random() < mr) { poly.r = clamp(poly.r + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.g = clamp(poly.g + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.b = clamp(poly.b + Math.floor(gaussianRandom() * 20), 0, 255); cc = true; }
      if (Math.random() < mr) { poly.a = clamp(poly.a + gaussianRandom() * 0.05, 0.01, 1); cc = true; }
      if (cc) GA._polyFill(poly);
      if (Math.random() < mr * 0.5) {
        const j = Math.floor(Math.random() * ind.polygons.length);
        [ind.polygons[i], ind.polygons[j]] = [ind.polygons[j], ind.polygons[i]];
      }
    }
  }

  step() {
    for (let i = 0; i < this.population.length; i++) {
      this.fitnesses[i] = this._fitness(this.population[i]);
    }

    let bestIdx = 0;
    for (let i = 1; i < this.population.length; i++) {
      if (this.fitnesses[i] < this.fitnesses[bestIdx]) bestIdx = i;
    }

    if (this.fitnesses[bestIdx] < this.bestFitness) {
      this.bestFitness = this.fitnesses[bestIdx];
      this.bestIndividual = this._cloneInd(this.population[bestIdx]);
    }

    const next = [this._cloneInd(this.population[bestIdx])];
    while (next.length < this.cfg.populationSize) {
      const child = this._crossover(this._tournamentSelect(), this._tournamentSelect());
      this._mutate(child);
      next.push(child);
    }

    this.population = next;
    this.generation++;
  }

  // Inject a migrant — replace the worst individual
  migrate(polygons) {
    if (this.population.length === 0) return;
    let worstIdx = 0;
    for (let i = 1; i < this.fitnesses.length; i++) {
      if (this.fitnesses[i] > this.fitnesses[worstIdx]) worstIdx = i;
    }
    const migrant = {
      polygons: polygons.map((p) =>
        GA._polyFill({
          points: p.points.map((pt) => ({ x: pt.x, y: pt.y })),
          r: p.r, g: p.g, b: p.b, a: p.a,
        })
      ),
    };
    this.population[worstIdx] = migrant;
    this.fitnesses[worstIdx] = Infinity;
  }
}

module.exports = { GA };
