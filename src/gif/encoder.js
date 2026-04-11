// GIF encoder — wraps gif.js.

import GIF from "gif.js";

export function encodeGif(outputFrames, width, height) {
  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: "dist/gif.worker.js",
    });

    for (const frame of outputFrames) {
      gif.addFrame(frame.canvas, { delay: frame.delay, copy: true });
    }

    gif.on("finished", (blob) => resolve(blob));
    gif.on("error", (err) => reject(err));
    gif.render();
  });
}
