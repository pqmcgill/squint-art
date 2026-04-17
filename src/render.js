// Render an individual's shapes to a canvas at its current size.

import { polygonShape } from "./ga/shapes.js";

export function renderPolygons(
  ctx,
  w,
  h,
  shapes,
  background = "#000",
  strategy = polygonShape,
) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  for (const s of shapes) {
    ctx.beginPath();
    strategy.drawPath(ctx, s, w, h);
    ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${s.a})`;
    ctx.fill();
  }
}
