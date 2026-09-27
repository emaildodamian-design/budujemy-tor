// Metrics of every level and sibling, computed once per test worker.
import type { Measured } from '../src/game/bands';
import type { Level } from '../src/game/level';
import { initialPieces, isRepair } from '../src/game/level';
import { ALL_LEVELS } from '../src/game/levels';
import { faultTypes, mechanicsOf, metricsOf, shortestSolution } from '../src/game/metrics';
import { trace } from '../src/game/trace';

const cache = new Map<string, Measured>();

export function measured(level: Level): Measured {
  let m = cache.get(level.id);
  if (!m) {
    const sol = shortestSolution(level);
    m = { level, m: metricsOf(level), mech: mechanicsOf(level, sol) };
    if (isRepair(level)) {
      m.faultTypes = faultTypes(level);
      m.initialFails = !trace(level, initialPieces(level)).success;
    }
    cache.set(level.id, m);
  }
  return m;
}

export const allMeasured = () => ALL_LEVELS.map(measured);
