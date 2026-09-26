import { clock } from "../../src/server/src/lib/clock.js";

export { clock };

export function setFixedClock(iso: string): Date {
  const date = new Date(iso);
  clock.setNow(date);
  return date;
}

export function clearFixedClock(): void {
  clock.setNow(null);
}
