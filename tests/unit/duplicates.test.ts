import { describe, expect, it } from "vitest";
import {
  findDuplicates,
  normalizeRepoUrl,
  normalizeTitle,
} from "../../src/server/src/modules/projects/duplicates";

describe("duplicates", () => {
  it("normalizes repo urls and titles", () => {
    expect(normalizeRepoUrl("HTTPS://WWW.Example.com/repo.GIT/")).toBe("example.com/repo.git");
    expect(normalizeTitle("  Hello, World!!! ")).toBe("hello world");
  });

  it("marks later projects as duplicates of earlier ones by repo", () => {
    const result = findDuplicates([
      {
        id: "p1",
        title: "Alpha",
        repoUrl: "https://example.com/a",
        submittedAt: new Date("2026-01-01"),
      },
      {
        id: "p2",
        title: "Beta",
        repoUrl: "https://www.example.com/a.git",
        submittedAt: new Date("2026-01-02"),
      },
    ]);
    expect(result.get("p2")).toBe("p1");
    expect(result.has("p1")).toBe(false);
  });

  it("detects title duplicates when repo differs", () => {
    const result = findDuplicates([
      {
        id: "p1",
        title: "Same Title",
        repoUrl: "https://example.com/one",
        submittedAt: new Date("2026-01-01"),
      },
      {
        id: "p2",
        title: "same title!",
        repoUrl: "https://example.com/two",
        submittedAt: new Date("2026-01-02"),
      },
    ]);
    expect(result.get("p2")).toBe("p1");
  });
});
