// Shared GA engine for Node.js — used by both bench.js and bench-worker.js.
// Requires @napi-rs/canvas createCanvas and a loaded Wasm instance to be injected.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function gaussianRandom() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Shape strategies — CommonJS duplicate of src/ga/shapes.js.
const polygonShape = {
  createGeometry(params) {
    const nv = params.numVertices;
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
    return { points };
  },
  cloneGeometry(s) {
    return { points: s.points.map((pt) => ({ x: pt.x, y: pt.y })) };
  },
  mutateGeometry(s, mr) {
    for (const pt of s.points) {
      if (Math.random() < mr) {
        pt.x = clamp(pt.x + gaussianRandom() * 0.05, 0, 1);
        pt.y = clamp(pt.y + gaussianRandom() * 0.05, 0, 1);
      }
    }
  },
  drawPath(ctx, s, w, h) {
    ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
    }
    ctx.closePath();
  },
};

const circleShape = {
  createGeometry() {
    return {
      x: Math.random(),
      y: Math.random(),
      radius: Math.random() * 0.12 + 0.01,
    };
  },
  cloneGeometry(s) {
    return { x: s.x, y: s.y, radius: s.radius };
  },
  mutateGeometry(s, mr) {
    if (Math.random() < mr) s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr)
      s.radius = clamp(s.radius + gaussianRandom() * 0.02, 0.002, 0.5);
  },
  drawPath(ctx, s, w, h) {
    const r = s.radius * Math.min(w, h);
    ctx.arc(s.x * w, s.y * h, r, 0, Math.PI * 2);
  },
};

const ellipseShape = {
  createGeometry() {
    return {
      x: Math.random(),
      y: Math.random(),
      rx: Math.random() * 0.12 + 0.01,
      ry: Math.random() * 0.12 + 0.01,
      rotation: Math.random() * Math.PI * 2,
    };
  },
  cloneGeometry(s) {
    return { x: s.x, y: s.y, rx: s.rx, ry: s.ry, rotation: s.rotation };
  },
  mutateGeometry(s, mr) {
    if (Math.random() < mr) s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr)
      s.rx = clamp(s.rx + gaussianRandom() * 0.02, 0.002, 0.5);
    if (Math.random() < mr)
      s.ry = clamp(s.ry + gaussianRandom() * 0.02, 0.002, 0.5);
    if (Math.random() < mr) {
      s.rotation =
        (((s.rotation + gaussianRandom() * 0.2) % (Math.PI * 2)) +
          Math.PI * 2) %
        (Math.PI * 2);
    }
  },
  drawPath(ctx, s, w, h) {
    const scale = Math.min(w, h);
    ctx.ellipse(
      s.x * w,
      s.y * h,
      s.rx * scale,
      s.ry * scale,
      s.rotation,
      0,
      Math.PI * 2,
    );
  },
};

const rectangleShape = {
  createGeometry() {
    return {
      x: Math.random(),
      y: Math.random(),
      w: Math.random() * 0.18 + 0.02,
      h: Math.random() * 0.18 + 0.02,
      rotation: Math.random() * Math.PI * 2,
    };
  },
  cloneGeometry(s) {
    return { x: s.x, y: s.y, w: s.w, h: s.h, rotation: s.rotation };
  },
  mutateGeometry(s, mr) {
    if (Math.random() < mr) s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr)
      s.w = clamp(s.w + gaussianRandom() * 0.03, 0.004, 1);
    if (Math.random() < mr)
      s.h = clamp(s.h + gaussianRandom() * 0.03, 0.004, 1);
    if (Math.random() < mr) {
      s.rotation =
        (((s.rotation + gaussianRandom() * 0.2) % (Math.PI * 2)) +
          Math.PI * 2) %
        (Math.PI * 2);
    }
  },
  drawPath(ctx, s, w, h) {
    const scale = Math.min(w, h);
    const rw = s.w * scale;
    const rh = s.h * scale;
    ctx.save();
    ctx.translate(s.x * w, s.y * h);
    ctx.rotate(s.rotation);
    ctx.rect(-rw / 2, -rh / 2, rw, rh);
    ctx.restore();
  },
};

const lineShape = {
  createGeometry() {
    return {
      x1: Math.random(),
      y1: Math.random(),
      x2: Math.random(),
      y2: Math.random(),
      thickness: Math.random() * 0.04 + 0.005,
    };
  },
  cloneGeometry(s) {
    return {
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      thickness: s.thickness,
    };
  },
  mutateGeometry(s, mr) {
    if (Math.random() < mr) s.x1 = clamp(s.x1 + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.y1 = clamp(s.y1 + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.x2 = clamp(s.x2 + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr) s.y2 = clamp(s.y2 + gaussianRandom() * 0.05, 0, 1);
    if (Math.random() < mr)
      s.thickness = clamp(s.thickness + gaussianRandom() * 0.01, 0.001, 0.2);
  },
  drawPath(ctx, s, w, h) {
    const px1 = s.x1 * w;
    const py1 = s.y1 * h;
    const px2 = s.x2 * w;
    const py2 = s.y2 * h;
    const dx = px2 - px1;
    const dy = py2 - py1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return;
    const nx = -dy / len;
    const ny = dx / len;
    const t = (s.thickness * Math.min(w, h)) / 2;
    ctx.moveTo(px1 + nx * t, py1 + ny * t);
    ctx.lineTo(px2 + nx * t, py2 + ny * t);
    ctx.lineTo(px2 - nx * t, py2 - ny * t);
    ctx.lineTo(px1 - nx * t, py1 - ny * t);
    ctx.closePath();
  },
};

function getShape(name) {
  if (name === "circle") return circleShape;
  if (name === "ellipse") return ellipseShape;
  if (name === "rectangle") return rectangleShape;
  if (name === "line") return lineShape;
  return polygonShape;
}

class GA {
  constructor(refData, w, h, cfg, createCanvas, wasmInstance) {
    this.refData = refData;
    this.w = w;
    this.h = h;
    this.cfg = cfg;
    this.wasm = wasmInstance;
    this.strategy = getShape(cfg.shape);
    this.shapeParams = { numVertices: cfg.numVertices };

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
    const fitRefData = this.fitCtx.getImageData(
      0,
      0,
      this.fitW,
      this.fitH,
    ).data;

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

  _randomShape() {
    return GA._polyFill({
      ...this.strategy.createGeometry(this.shapeParams),
      r: Math.floor(Math.random() * 256),
      g: Math.floor(Math.random() * 256),
      b: Math.floor(Math.random() * 256),
      a: Math.random() * 0.4 + 0.05,
    });
  }

  _cloneShape(s) {
    return {
      ...this.strategy.cloneGeometry(s),
      r: s.r,
      g: s.g,
      b: s.b,
      a: s.a,
      fill: s.fill,
    };
  }

  _cloneInd(ind) {
    return { polygons: ind.polygons.map((s) => this._cloneShape(s)) };
  }

  _createIndividual() {
    const shapes = [];
    for (let i = 0; i < this.cfg.numPolygons; i++)
      shapes.push(this._randomShape());
    return { polygons: shapes };
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
    c.fillStyle = this.cfg.background || "#000";
    c.fillRect(0, 0, w, h);
    for (const s of ind.polygons) {
      c.beginPath();
      this.strategy.drawPath(c, s, w, h);
      c.fillStyle = s.fill;
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
      child.polygons.push(this._cloneShape(src.polygons[i]));
    }
    return child;
  }

  _mutate(ind) {
    const mr = this.cfg.mutationRate;
    for (let i = 0; i < ind.polygons.length; i++) {
      if (Math.random() < mr * 0.1) {
        ind.polygons[i] = this._randomShape();
        continue;
      }
      const s = ind.polygons[i];
      this.strategy.mutateGeometry(s, mr, this.shapeParams);
      let cc = false;
      if (Math.random() < mr) {
        s.r = clamp(s.r + Math.floor(gaussianRandom() * 20), 0, 255);
        cc = true;
      }
      if (Math.random() < mr) {
        s.g = clamp(s.g + Math.floor(gaussianRandom() * 20), 0, 255);
        cc = true;
      }
      if (Math.random() < mr) {
        s.b = clamp(s.b + Math.floor(gaussianRandom() * 20), 0, 255);
        cc = true;
      }
      if (Math.random() < mr) {
        s.a = clamp(s.a + gaussianRandom() * 0.05, 0.01, 1);
        cc = true;
      }
      if (cc) GA._polyFill(s);
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
      const child = this._crossover(
        this._tournamentSelect(),
        this._tournamentSelect(),
      );
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
      polygons: polygons.map((s) => GA._polyFill(this._cloneShape(s))),
    };
    this.population[worstIdx] = migrant;
    this.fitnesses[worstIdx] = Infinity;
  }
}

module.exports = { GA };
