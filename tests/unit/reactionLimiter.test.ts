import { describe, it, expect } from "vitest";
import { ReactionLimiter } from "@/lib/realtime/reactionLimiter";

describe("Reaction Limiter", () => {
  it("allows first reaction immediately", () => {
    const limiter = new ReactionLimiter(300);
    expect(limiter.canReact(1000)).toBe(true);
  });

  it("blocks rapid reactions occurring within 300ms", () => {
    const limiter = new ReactionLimiter(300);
    expect(limiter.canReact(1000)).toBe(true);
    expect(limiter.canReact(1100)).toBe(false);
    expect(limiter.canReact(1250)).toBe(false);
  });

  it("permits reaction after 300ms window has passed", () => {
    const limiter = new ReactionLimiter(300);
    expect(limiter.canReact(1000)).toBe(true);
    expect(limiter.canReact(1300)).toBe(true);
    expect(limiter.canReact(1400)).toBe(false);
    expect(limiter.canReact(1650)).toBe(true);
  });
});
