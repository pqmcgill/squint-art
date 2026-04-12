# Roadmap

## Boilerplate / DX

- [x] CI pipeline (GitHub Actions: build + test on PR)
- [ ] Pre-commit hook running `bun test`
- [x] `.nvmrc` or `package.json` engines field to pin Node/Bun versions
- [x] License file (MIT)
- [x] Contributing guide

## Documentation

- [ ] Add JSDoc to pure modules (`operators`, `topology`, `fitness`, `chart/data`) for IDE autocomplete and potential auto-generated API docs
- [ ] Replace optimization deep dive markdown tables with chart images for visual impact
- [ ] Add a Troubleshooting section to README (bun not installed, build not run before serve, common browser issues)

## Features

- [ ] Background color picker — choose black, white, or custom background for the output canvas. Some images (especially those with light backgrounds) converge significantly faster on white than black
- [ ] Export to SVG — the polygon representation is inherently vector. Export the best individual as an SVG file for infinite resolution, tiny file size, and embeddability anywhere. Nearly free since the polygon data already exists.
- [ ] Timelapse export — record the evolution itself as a video, from random noise to recognizable image. Each frame is the best individual at that generation. The most visually compelling artifact the tool produces.
- [ ] Video input/output with audio passthrough — same frame-by-frame pipeline as GIF mode but with MP4/WebM via the browser's VideoDecoder/VideoEncoder APIs. Higher resolution, longer duration, warm-start temporal coherence at 30fps, original audio preserved.
- [ ] Audio visualization — feed in audio, map frequency bands to polygon parameters (bass → polygon size, treble → vertex count, midrange → color). The polygon art dances to the music.

## Optimizations

- [x] ~~WebGL/WebGPU rendering for fitness evaluation~~ — **Investigated and rejected.** Tested WebGL2 (render-only + CPU diff, full GPU pipeline) and WebGPU (batched render + compute shader diff + async readback). All three approaches were slower than Canvas 2D (30-200 gen/s vs 1000 gen/s) because: (1) `readPixels`/`mapAsync` forces a GPU pipeline sync that costs ~7-42ms per call regardless of data size, and (2) at fitness resolution (64x43px), GPU driver overhead per render pass dominates actual computation. Canvas 2D's software rasterizer avoids GPU sync entirely and is highly optimized for small canvases.
- [x] ~~Delta evaluation / hill climbing~~ — **Investigated and rejected.** Hill climbing (mutate one polygon, accept if better) was ~50x faster in throughput but plateaued at ~96% similarity due to local optima. Hybrid (generational → hill climbing auto-switch) didn't outperform pure generational GA either. The GA's population diversity is essential for continued improvement.
- [x] Adaptive mutation rate — mutation rate oscillates between 0.005 (fine-tuning) and 0.15 (exploration) based on whether fitness improved over a 50-generation window. Helps break through plateaus that fixed-rate mutation gets stuck on.
- [x] Single-point crossover — replaced uniform crossover (random per-polygon shuffle) with single-point crossover that preserves polygon drawing order from each parent. Better preserves coordinated polygon layering effects.
- [ ] Adaptive fitness resolution — start at fd4 for fast early convergence, ramp to fd1 as improvement slows. Data-driven progressive resolution based on actual fitness delta per generation
- [ ] Speciation within islands — maintain sub-populations with different polygon counts or mutation strategies, letting the algorithm explore multiple representation complexities simultaneously
- [ ] GIF mode: parallel frame processing — distribute frames across islands instead of processing sequentially, with warm-start seeding from neighbor frames

## Testing

- [ ] Integration test: run GA for N generations headlessly via the worker, assert that similarity improves monotonically (elitism guarantee)
- [ ] Integration test: verify migration actually transfers genetic material between islands (run two islands, inject a known individual, verify it appears in the other island's population)
- [ ] Visual regression snapshots for the chart renderer — render known data, compare output canvas pixels against a baseline image

## Performance Monitoring

- [ ] Flame graph integration — profile where time is actually spent inside the browser worker (rendering vs readback vs diff vs GA overhead)
- [ ] Memory tracking — monitor for leaks during long runs, particularly around population cloning and ImageData allocation in the fitness loop
