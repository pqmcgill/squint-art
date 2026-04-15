// Render polygons to a canvas at its current size.

export function renderPolygons(ctx, w, h, polygons, background = "#000") {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  for (const poly of polygons) {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x * w, poly.points[0].y * h);
    for (let i = 1; i < poly.points.length; i++) {
      ctx.lineTo(poly.points[i].x * w, poly.points[i].y * h);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${poly.r},${poly.g},${poly.b},${poly.a})`;
    ctx.fill();
  }
}
