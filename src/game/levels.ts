// The 40 shipped levels, validated when the app loads (and in tests).

import data from './levels.json';
import { type Level, validateLevel } from './level';

export const LEVELS: readonly Level[] = data as Level[];

const problems = LEVELS.flatMap(validateLevel);
if (problems.length > 0) throw new Error(`Invalid levels:\n${problems.join('\n')}`);

export const LEVEL_COUNT = LEVELS.length;

export function levelById(id: string): Level | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
