export interface Clock {
  now(): Date;
  nowIso(): string;
  nowEpochMs(): number;
}

export const CLOCK = Symbol('CLOCK');

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public nowIso(): string {
    return new Date().toISOString();
  }

  public nowEpochMs(): number {
    return Date.now();
  }
}

export class FakeClock implements Clock {
  private currentTime: Date;

  public constructor(initialTime: Date | string = new Date()) {
    this.currentTime =
      typeof initialTime === 'string' ? new Date(initialTime) : new Date(initialTime.getTime());
  }

  public now(): Date {
    return new Date(this.currentTime.getTime());
  }

  public nowIso(): string {
    return this.currentTime.toISOString();
  }

  public nowEpochMs(): number {
    return this.currentTime.getTime();
  }

  public setTime(time: Date | string): void {
    this.currentTime = typeof time === 'string' ? new Date(time) : new Date(time.getTime());
  }

  public advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  public advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }

  public advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000);
  }

  public advanceHours(hours: number): void {
    this.advance(hours * 3600 * 1000);
  }
}
