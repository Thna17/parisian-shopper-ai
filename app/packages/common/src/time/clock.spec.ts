import { describe, expect, it } from '@jest/globals';
import { FakeClock, SystemClock } from './clock.js';

describe('Clock Abstraction', () => {
  it('SystemClock returns real system time', () => {
    const clock = new SystemClock();
    const before = Date.now();
    const now = clock.now();
    const nowEpoch = clock.nowEpochMs();
    const after = Date.now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
    expect(nowEpoch).toBeGreaterThanOrEqual(before);
    expect(nowEpoch).toBeLessThanOrEqual(after);
  });

  it('FakeClock allows deterministic control over time', () => {
    const initialDate = new Date('2026-10-19T00:00:00.000Z');
    const clock = new FakeClock(initialDate);

    expect(clock.now()).toEqual(initialDate);
    expect(clock.nowEpochMs()).toBe(initialDate.getTime());

    // Advance by 15 minutes
    clock.advance(15 * 60 * 1000);
    expect(clock.now()).toEqual(new Date('2026-10-19T00:15:00.000Z'));
    expect(clock.nowEpochMs()).toBe(initialDate.getTime() + 15 * 60 * 1000);

    // Set absolute time
    const newDate = new Date('2026-10-20T12:00:00.000Z');
    clock.setTime(newDate);
    expect(clock.now()).toEqual(newDate);

    clock.setTime(new Date(1000));
    expect(clock.nowEpochMs()).toBe(1000);
    expect(clock.now()).toEqual(new Date(1000));
  });
});
