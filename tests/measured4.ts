// Metrics of v4 levels, computed once per test file.
import type { ProgLevel } from '../src/game/program';
import { type ProgMetrics, metricsOf } from '../src/game/progMetrics';

const cache = new Map<ProgLevel, ProgMetrics>();
export function measured4(l: ProgLevel): ProgMetrics {
  let m = cache.get(l);
  if (!m) {
    m = metricsOf(l);
    cache.set(l, m);
  }
  return m;
}
