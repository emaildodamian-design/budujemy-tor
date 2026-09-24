import { describe, expect, it } from 'vitest';
import {
  LONG_PRESS_MS,
  UNLOCKED,
  dayKey,
  isLocked,
  isLongPressComplete,
  markSessionEnded,
  overrideLock,
} from '../src/game/lock';

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);

describe('next-day lock', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(at(2026, 9, 24, 0, 1))).toBe('2026-09-24');
    expect(dayKey(at(2026, 9, 24, 23, 59))).toBe('2026-09-24');
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
  });

  it('is open before any session', () => {
    expect(isLocked(UNLOCKED, at(2026, 9, 24))).toBe(false);
  });

  it('locks for the rest of the day once a session ends', () => {
    const lock = markSessionEnded(at(2026, 9, 24, 8, 0));
    expect(isLocked(lock, at(2026, 9, 24, 8, 1))).toBe(true);
    expect(isLocked(lock, at(2026, 9, 24, 23, 59))).toBe(true);
  });

  it('opens again on the next calendar day (even just after midnight)', () => {
    const lock = markSessionEnded(at(2026, 9, 24, 23, 50));
    expect(isLocked(lock, at(2026, 9, 25, 0, 0))).toBe(false);
    expect(isLocked(lock, at(2026, 10, 3))).toBe(false);
  });

  it('handles month and year boundaries', () => {
    expect(isLocked(markSessionEnded(at(2026, 12, 31, 20)), at(2027, 1, 1, 7))).toBe(false);
    expect(isLocked(markSessionEnded(at(2026, 9, 30, 20)), at(2026, 10, 1, 7))).toBe(false);
  });

  it('stays locked if the clock goes backwards', () => {
    const lock = markSessionEnded(at(2026, 9, 24));
    expect(isLocked(lock, at(2026, 9, 23))).toBe(true);
  });
});

describe('parent override (3-second long-press)', () => {
  it('requires the full 3 seconds', () => {
    expect(LONG_PRESS_MS).toBe(3000);
    expect(isLongPressComplete(0, 2999)).toBe(false);
    expect(isLongPressComplete(0, 3000)).toBe(true);
  });

  it('a short press keeps the lock; a full press unlocks for one more session', () => {
    const now = at(2026, 9, 24, 18);
    const lock = markSessionEnded(now);
    expect(overrideLock(lock, 0, 1500)).toBe(lock);
    const open = overrideLock(lock, 0, 3000);
    expect(isLocked(open, now)).toBe(false);
    // Finishing that extra session locks again.
    expect(isLocked(markSessionEnded(now), now)).toBe(true);
  });
});
