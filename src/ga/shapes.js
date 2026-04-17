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

export const ellipseShape = {
  name: "ellipse",

  createGeometry(_params) {
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

  mutateGeometry(s, mr, _params) {
    if (Math.random() < mr) {
      s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.rx = clamp(s.rx + gaussianRandom() * 0.02, 0.002, 0.5);
    }
    if (Math.random() < mr) {
      s.ry = clamp(s.ry + gaussianRandom() * 0.02, 0.002, 0.5);
    }
    if (Math.random() < mr) {
      // Rotation wraps — no clamp. Normalize into [0, 2π) to keep numbers tidy.
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

export const rectangleShape = {
  name: "rectangle",

  createGeometry(_params) {
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

  mutateGeometry(s, mr, _params) {
    if (Math.random() < mr) {
      s.x = clamp(s.x + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.y = clamp(s.y + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.w = clamp(s.w + gaussianRandom() * 0.03, 0.004, 1);
    }
    if (Math.random() < mr) {
      s.h = clamp(s.h + gaussianRandom() * 0.03, 0.004, 1);
    }
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
    // rect() records path segments through the current CTM, so we transform
    // around the rect's center then restore — the filled path stays rotated.
    ctx.save();
    ctx.translate(s.x * w, s.y * h);
    ctx.rotate(s.rotation);
    ctx.rect(-rw / 2, -rh / 2, rw, rh);
    ctx.restore();
  },
};

export const lineShape = {
  name: "line",

  createGeometry(_params) {
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

  mutateGeometry(s, mr, _params) {
    if (Math.random() < mr) {
      s.x1 = clamp(s.x1 + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.y1 = clamp(s.y1 + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.x2 = clamp(s.x2 + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.y2 = clamp(s.y2 + gaussianRandom() * 0.05, 0, 1);
    }
    if (Math.random() < mr) {
      s.thickness = clamp(s.thickness + gaussianRandom() * 0.01, 0.001, 0.2);
    }
  },

  drawPath(ctx, s, w, h) {
    // Thick line as a filled quadrilateral — computed in pixel space so the
    // line stays perpendicular to itself regardless of canvas aspect ratio.
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

const STRATEGIES = {
  polygon: polygonShape,
  circle: circleShape,
  ellipse: ellipseShape,
  rectangle: rectangleShape,
  line: lineShape,
};

export function getShape(name) {
  return STRATEGIES[name] || polygonShape;
}
