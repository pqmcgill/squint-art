// Island model — spawn/kill workers, coordinate migration.

import { TOPOLOGIES, selectSource } from "./topology.js";

export class IslandManager {
  constructor() {
    this.workers = [];
    this.islandState = [];  // { generation, similarity, polygons } per island
    this.globalBest = null;
    this._migrationTimer = null;
    this.onUpdate = null;   // (islandIndex, msg) => void
  }

  get numIslands() {
    return this.workers.length;
  }

  spawn(imageBuffer, width, height, config, numIslands, topology) {
    this.kill();

    this.islandState = new Array(numIslands).fill(null);
    this.globalBest = null;

    const topoFn = TOPOLOGIES[topology] || TOPOLOGIES.ring;

    for (let i = 0; i < numIslands; i++) {
      const w = new Worker("dist/worker.js");

      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "update" || msg.type === "done") {
          this.islandState[i] = {
            generation: msg.generation,
            similarity: msg.similarity,
            polygons: msg.polygons,
          };

          if (!this.globalBest || msg.similarity > this.globalBest.similarity) {
            this.globalBest = { similarity: msg.similarity, polygons: msg.polygons };
          }

          if (this.onUpdate) this.onUpdate(i, msg);
        }
      };

      w.postMessage({
        type: "start",
        imageData: imageBuffer.slice(0),
        width,
        height,
        config,
      });

      this.workers.push(w);
    }

    // Periodic migration
    this._migrationTimer = setInterval(() => {
      this._migrate(topology);
    }, 5000);
  }

  kill() {
    if (this._migrationTimer) {
      clearInterval(this._migrationTimer);
      this._migrationTimer = null;
    }
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  totalGenerations() {
    let total = 0;
    for (const s of this.islandState) if (s) total += s.generation;
    return total;
  }

  _migrate(topology) {
    if (this.workers.length < 2) return;

    const topoFn = TOPOLOGIES[topology] || TOPOLOGIES.ring;
    const n = this.workers.length;
    const events = [];

    for (let i = 0; i < n; i++) {
      const neighbors = topoFn.neighbors(i, n);
      const source = selectSource(neighbors, this.islandState);
      if (source !== null && this.islandState[source]) {
        this.workers[i].postMessage({
          type: "migrate",
          polygons: this.islandState[source].polygons,
        });
        events.push({ from: source, to: i });
      }
    }

    return events;
  }
}

export function getDefaultIslandCount() {
  return Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
}
