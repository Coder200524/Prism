export type DuplicateProjectInput = {
  id: string;
  title: string;
  repoUrl: string;
  submittedAt: Date | null;
};

export function normalizeRepoUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
}

export function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/g, " ");
}

function submissionOrderKey(project: DuplicateProjectInput): string {
  const submitted = project.submittedAt?.toISOString() ?? "";
  return `${submitted}\0${project.id}`;
}

/** Returns map of later project id → earlier project id it duplicates. */
export function findDuplicates(
  projects: DuplicateProjectInput[],
): Map<string, string> {
  const byRepo = new Map<string, DuplicateProjectInput[]>();
  const byTitle = new Map<string, DuplicateProjectInput[]>();

  for (const project of projects) {
    const repoKey = normalizeRepoUrl(project.repoUrl);
    if (repoKey) {
      const list = byRepo.get(repoKey) ?? [];
      list.push(project);
      byRepo.set(repoKey, list);
    }
    const titleKey = normalizeTitle(project.title);
    if (titleKey) {
      const list = byTitle.get(titleKey) ?? [];
      list.push(project);
      byTitle.set(titleKey, list);
    }
  }

  const duplicateOf = new Map<string, string>();
  const byId = new Map(projects.map((project) => [project.id, project]));

  function markGroup(group: DuplicateProjectInput[]): void {
    if (group.length < 2) return;
    const sorted = [...group].sort((a, b) =>
      submissionOrderKey(a).localeCompare(submissionOrderKey(b)),
    );
    const original = sorted[0];
    if (!original) return;
    for (const later of sorted.slice(1)) {
      const currentOriginalId = duplicateOf.get(later.id);
      if (!currentOriginalId) {
        duplicateOf.set(later.id, original.id);
        continue;
      }
      const currentOriginal = byId.get(currentOriginalId);
      if (
        currentOriginal &&
        submissionOrderKey(original).localeCompare(submissionOrderKey(currentOriginal)) < 0
      ) {
        duplicateOf.set(later.id, original.id);
      }
    }
  }

  for (const group of byRepo.values()) markGroup(group);
  for (const group of byTitle.values()) markGroup(group);

  return duplicateOf;
}
