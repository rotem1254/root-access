/** Time source, injected everywhere so tests are deterministic. Milliseconds since the epoch. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock that only moves when told to. */
export class ManualClock implements Clock {
  private time: number;

  constructor(start = 0) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }

  set(time: number): void {
    this.time = time;
  }
}

/** In-game time: a fixed story start plus the real time elapsed since this clock was created. */
export function storyClock(storyStart: number, real: Clock): Clock {
  const began = real.now();
  return { now: () => storyStart + (real.now() - began) };
}
