// GIF decoder — wraps gifuct-js, returns composited frames with delays.

import { parseGIF, decompressFrames } from "gifuct-js";

export function decodeGif(arrayBuffer) {
  const gif = parseGIF(arrayBuffer);
  const rawFrames = decompressFrames(gif, true);

  if (rawFrames.length === 0) throw new Error("No frames found in GIF");

  const w = gif.lsd.width;
  const h = gif.lsd.height;

  const compCanvas = document.createElement("canvas");
  compCanvas.width = w;
  compCanvas.height = h;
  const compCtx = compCanvas.getContext("2d");

  const frames = [];
  for (const frame of rawFrames) {
    const patch = new ImageData(
      new Uint8ClampedArray(frame.patch),
      frame.dims.width,
      frame.dims.height,
    );

    if (frame.disposalType === 2) {
      compCtx.clearRect(0, 0, w, h);
    }

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = frame.dims.width;
    tmpCanvas.height = frame.dims.height;
    tmpCanvas.getContext("2d").putImageData(patch, 0, 0);
    compCtx.drawImage(tmpCanvas, frame.dims.left, frame.dims.top);

    const fullFrame = compCtx.getImageData(0, 0, w, h);

    // gifuct-js returns delay in ms; Chrome treats <= 10ms as 100ms
    const delayMs = (frame.delay <= 10) ? 100 : frame.delay;

    frames.push({ imageData: fullFrame, delay: delayMs });
  }

  return { frames, width: w, height: h };
}
