// GIF playback — pre-renders frames and plays them at correct timing.

export class GifPlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._rendered = [];
    this.index = 0;
    this._timer = null;
  }

  setFrames(frames, displayW, displayH) {
    this.stop();
    this.canvas.width = displayW;
    this.canvas.height = displayH;
    this._rendered = frames.map((f) => {
      const c = document.createElement("canvas");
      c.width = displayW;
      c.height = displayH;
      const cctx = c.getContext("2d");
      if (f.source instanceof ImageData) {
        const tmp = document.createElement("canvas");
        tmp.width = f.source.width;
        tmp.height = f.source.height;
        tmp.getContext("2d").putImageData(f.source, 0, 0);
        cctx.drawImage(tmp, 0, 0, displayW, displayH);
      } else {
        cctx.drawImage(f.source, 0, 0, displayW, displayH);
      }
      return { canvas: c, delay: f.delay };
    });
    this.index = 0;
    if (this._rendered.length > 0) this._drawFrame(0);
  }

  play() {
    if (this._rendered.length < 2) return;
    this.stop();
    this._scheduleNext();
  }

  stop() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _drawFrame(i) {
    const frame = this._rendered[i];
    if (frame) this.ctx.drawImage(frame.canvas, 0, 0);
  }

  _scheduleNext() {
    const frame = this._rendered[this.index];
    if (!frame) return;
    this._timer = setTimeout(() => {
      this.index = (this.index + 1) % this._rendered.length;
      this._drawFrame(this.index);
      this._scheduleNext();
    }, frame.delay);
  }
}
