import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "../../src/server/src/modules/projects/service";

describe("escapeLikePattern", () => {
  it("escapes backslash, percent, and underscore for literal ILIKE matching", () => {
    expect(escapeLikePattern("100% done")).toBe("100\\% done");
    expect(escapeLikePattern("foo_bar")).toBe("foo\\_bar");
    expect(escapeLikePattern(String.raw`path\to\file`)).toBe(String.raw`path\\to\\file`);
    expect(escapeLikePattern("%_%\\")).toBe(String.raw`\%\_\%\\`);
  });
});
