import { describe, expect, it } from "vitest";
import { shuffleForVoter } from "../../src/server/src/modules/community/ballot";

describe("ballot shuffle", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);

  it("is stable for the same voter and event", () => {
    const shuffle1 = shuffleForVoter(items, "voter1", "evt1");
    const shuffle2 = shuffleForVoter(items, "voter1", "evt1");
    expect(shuffle1).toEqual(shuffle2);
  });

  it("differs across voters", () => {
    const shuffle1 = shuffleForVoter(items, "voter1", "evt1");
    const shuffle2 = shuffleForVoter(items, "voter2", "evt1");
    expect(shuffle1).not.toEqual(shuffle2);
  });

  it("is a permutation (no loss or duplication)", () => {
    const shuffle = shuffleForVoter(items, "voter1", "evt1");
    expect(shuffle).toHaveLength(items.length);
    const sorted = [...shuffle].sort((a, b) => a - b);
    expect(sorted).toEqual(items);
  });

  it("has a roughly uniform first position over 1000 voters", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 1000; i++) {
      const shuffle = shuffleForVoter(items, `voter${i}`, "evt1");
      const first = shuffle[0] as number;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    
    // Each of the 10 items should appear roughly 100 times.
    // 60-140 is a generous bound for 1000 trials to avoid flakiness.
    for (const item of items) {
      const count = counts.get(item) ?? 0;
      expect(count).toBeGreaterThan(60);
      expect(count).toBeLessThan(140);
    }
  });
});
