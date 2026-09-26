import crypto from "node:crypto";

class Mulberry32 {
  private a: number;

  constructor(seed: number) {
    this.a = seed;
  }

  next(): number {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function shuffleForVoter<T>(items: T[], voterId: string, eventId: string): T[] {
  if (items.length === 0) return [];
  const hash = crypto.createHash("sha256").update(`${voterId}:${eventId}`).digest();
  const seed = hash.readUInt32LE(0);
  const prng = new Mulberry32(seed);

  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}
