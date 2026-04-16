// Shape strategies — encapsulate per-shape geometry so the rest of the GA
// (crossover, tournament, fitness, islands) stays shape-agnostic.

import { clamp, gaussianRandom } from "./math.js";

export const polygonShape = {
  name: "polygon",

  createGeometry(params) {
    const nv = params.numVertices;
    const cx = Math.random();
    const cy = Math.random();
    const radius = Math.random() * 0.15 + 0.02;
    const startAngle = Math.random() * Math.PI * 2;
    const points = [];
    for (let i = 0; i < nv; i++) {
      const angle = startAngle + (i / nv) * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      points.push({
        x: clamp(cx + Math.cos(angle) * r, 0, 1),
        y: clamp(cy + Math.sin(angle) * r, 0, 1),
      });
    }
    return { points };
  },

  cloneGeometry(s) {
    return { points: s.points.map((pt) => ({ x: pt.x, y: pt.y })) };
  },

  mutateGeometry(s, mr, _params) {
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

export const circleShape = {
  name: "circle",

  createGeometry(_params) {
    return {
      x: Math.random(),
      y: Math.random(),
      radius: Math.random() * 0.12 + 0.01,
    };
  },

  cloneGeometry(s) {
    return { x: s.x, y: s.y, radius: s.radius };
  },

  mutateGeometry(s, mr, _params) {
    if (Math.random() < mr) {
      s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.radius = clamp(s.radius + gaussianRandom() * 0.02, 0.002, 0.5);
    }
  },

  drawPath(ctx, s, w, h) {
    const r = s.radius * Math.min(w, h);
    ctx.arc(s.x * w, s.y * h, r, 0, Math.PI * 2);
  },
};

const STRATEGIES = {
  polygon: polygonShape,
  circle: circleShape,
};

export function getShape(name) {
  return STRATEGIES[name] || polygonShape;
}
