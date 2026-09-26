let nowOverride: Date | null = null;

export const clock = {
  now(): Date {
    return nowOverride ?? new Date();
  },
  setNow(value: Date | null): void {
    nowOverride = value;
  },
};
