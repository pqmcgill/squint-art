#!/usr/bin/env node
// Build script — bundles src/ into dist/ using bun.
// Two entry points: app.js (main) and ga/worker.js (web worker).
// Also copies static assets (gif.worker.js, fitness.wasm).

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "dist");
fs.mkdirSync(dist, { recursive: true });

// Bundle main app
execSync("bun build src/app.js --outdir dist --entry-naming [name].js", { stdio: "inherit" });

// Bundle worker separately
execSync("bun build src/ga/worker.js --outdir dist --entry-naming worker.js", { stdio: "inherit" });

// Copy gif.js worker (static asset — gif.js loads it by URL)
fs.copyFileSync(
  path.join(__dirname, "node_modules", "gif.js", "dist", "gif.worker.js"),
  path.join(dist, "gif.worker.js"),
);

// Copy fitness.wasm
fs.copyFileSync(
  path.join(__dirname, "fitness.wasm"),
  path.join(dist, "fitness.wasm"),
);

console.log("Build complete → dist/");
