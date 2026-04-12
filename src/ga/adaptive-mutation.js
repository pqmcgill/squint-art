// Adaptive mutation rate — heats when stalled, cools when improving.

export function createAdaptiveMutation(initialRate, options = {}) {
  const min = options.min ?? 0.005;
  const max = options.max ?? 0.15;
  const heatFactor = options.heatFactor ?? 1.5;
  const coolFactor = options.coolFactor ?? 0.9;
  const window = options.window ?? 50;

  let rate = initialRate;
  let generation = 0;
  let windowStart = 0;
  let fitnessAtWindowStart = Infinity;

  return {
    get rate() {
      return rate;
    },

    /** Call once per generation with the current best fitness (lower = better). */
    update(currentFitness) {
      generation++;
      if (generation - windowStart < window) return;

      if (fitnessAtWindowStart < Infinity) {
        if (currentFitness < fitnessAtWindowStart) {
          rate = Math.max(min, rate * coolFactor);
        } else {
          rate = Math.min(max, rate * heatFactor);
        }
      }

      fitnessAtWindowStart = currentFitness;
      windowStart = generation;
    },

    reset(initialRate_) {
      rate = initialRate_;
      generation = 0;
      windowStart = 0;
      fitnessAtWindowStart = Infinity;
    },
  };
}
