# Roadmap

## Boilerplate / DX

- [x] CI pipeline (GitHub Actions: build + test on PR)
- [ ] Pre-commit hook running `bun test`
- [ ] `.nvmrc` or `package.json` engines field to pin Node/Bun versions
- [ ] License file (MIT)
- [x] Contributing guide

## Documentation

- [ ] Add JSDoc to pure modules (`operators`, `topology`, `fitness`, `chart/data`) for IDE autocomplete and potential auto-generated API docs
- [ ] Replace optimization deep dive markdown tables with chart images for visual impact
- [ ] Add a Troubleshooting section to README (bun not installed, build not run before serve, common browser issues)

## Features

- [ ] Background color picker — choose black, white, or custom background for the output canvas. Some images (especially those with light backgrounds) converge significantly faster on white than black

## Optimizations

- [ ] WebGL rendering for fitness evaluation — move polygon rasterization to the GPU, eliminating the Canvas 2D bottleneck that dominates all current profiling
- [ ] Delta evaluation — when mutating a single polygon, only re-render and compare its bounding box instead of the full canvas. Requires a hill-climbing variant rather than generational GA, but the speedup per evaluation is massive
- [ ] Adaptive mutation rate — decrease mutation rate as fitness plateaus to fine-tune, increase when stuck to escape local optima
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
