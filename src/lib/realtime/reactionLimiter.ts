export class ReactionLimiter {
  private lastReactionTime = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 300) {
    this.minIntervalMs = minIntervalMs;
  }

  canReact(now = Date.now()): boolean {
    if (now - this.lastReactionTime >= this.minIntervalMs) {
      this.lastReactionTime = now;
      return true;
    }
    return false;
  }
}
