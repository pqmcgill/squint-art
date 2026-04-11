# Contributing to Squint Art

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/pqmcgill/squint-art.git
cd squint-art
npm install
npm run build
npm start         # serves on http://localhost:3000
```

## Workflow

1. **Fork** the repo and create a branch from `main`
2. Make your changes
3. Run `npm test` to make sure tests pass
4. Run `npm run build` to verify the build succeeds
5. Open a **pull request** against `main`

All changes go through PRs — direct pushes to `main` are blocked. CI will run tests automatically on your PR, and Socket.dev will scan any dependency changes.

## Branch Protection

`main` requires:
- A pull request (no direct pushes)
- The `test` CI check to pass

No approval is required for maintainer PRs, but external contributions will be reviewed.

## Project Structure

```
src/
  app.js                 DOM wiring (the main controller)
  render.js              Shared polygon renderer
  ga/                    Genetic algorithm core
    operators.js         Pure: polygon CRUD, crossover, mutation
    topology.js          Pure: migration topology + selection
    fitness.js           Pure: pixel diff, similarity math
    fitness.wat          WebAssembly pixel diff source
    island-manager.js    Worker lifecycle + migration
    worker.js            Web Worker entry point
  gif/                   GIF processing pipeline
  chart/                 Performance chart + island viz
  bench/                 Headless benchmark runner
test/                    Unit tests
```

**Pure modules** (`operators`, `topology`, `fitness`, `chart/data`) have no DOM dependency and are the easiest to contribute to and test.

## Testing

```bash
npm test              # runs bun test
```

Tests live in `test/` and use bun's built-in test runner. When adding new logic to pure modules, add corresponding tests. DOM-dependent code doesn't need unit tests — verify it manually in the browser.

## Building

```bash
npm run build         # bun bundles src/ into dist/
```

This compiles `fitness.wat` to Wasm, bundles the app and worker as separate entry points, and copies static assets to `dist/`.

## Code Style

- ES modules (`import`/`export`) throughout `src/`
- No framework — vanilla JS and Canvas API
- Keep pure logic separated from DOM code for testability
- Don't add dependencies without good reason — the project intentionally has a small dependency tree

## Bug Reports and Feature Requests

Open an issue on GitHub. For feature ideas, check the [ROADMAP.md](ROADMAP.md) first — it may already be planned.
