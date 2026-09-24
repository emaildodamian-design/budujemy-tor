// Next-day lock: after a session ends, a new one opens on the next calendar day
// (device local time). A parent can override with a 3-second long-press.

export const LONG_PRESS_MS = 3000;

export interface LockState {
  /** Local calendar day (YYYY-MM-DD) on which the last session ended, or null. */
  readonly lastEndedDay: string | null;
}

export const UNLOCKED: LockState = { lastEndedDay: null };

/** Local calendar day as YYYY-MM-DD (sorts correctly as a string). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Locked from the moment a session ends until local midnight. If the device
 * clock goes backwards (last day is "in the future"), stay locked: the parent
 * override exists for that.
 */
export function isLocked(lock: LockState, now: Date): boolean {
  return lock.lastEndedDay !== null && lock.lastEndedDay >= dayKey(now);
}

export function markSessionEnded(now: Date): LockState {
  return { lastEndedDay: dayKey(now) };
}

/** A long-press counts only when held for the full 3 seconds without letting go. */
export function isLongPressComplete(pressedAt: number, now: number): boolean {
  return now - pressedAt >= LONG_PRESS_MS;
}

/** Parent override: allows exactly one more session today (the next end locks again). */
export function overrideLock(lock: LockState, pressedAt: number, releasedOrNow: number): LockState {
  return isLongPressComplete(pressedAt, releasedOrNow) ? UNLOCKED : lock;
}
