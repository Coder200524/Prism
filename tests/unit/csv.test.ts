import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "../../src/server/src/lib/csv";

describe("csv", () => {
  it("escapes commas quotes and newlines", () => {
    expect(escapeCsvCell('hello, "world"')).toBe('"hello, ""world"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("guards formula injection", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+cmd")).toBe("'+cmd");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@sum")).toBe("'@sum");
  });

  it("joins rows with commas and trailing newline", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\nc,d\n");
  });
});
