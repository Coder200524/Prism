export type EventPhaseFields = {
  publishedAt: Date | null;
  submissionsOpen: Date;
  submissionsClose: Date;
  judgingClose: Date | null;
  resultsPublishedAt: Date | null;
  votingOpen?: Date | null;
  votingClose?: Date | null;
};

export type EventPhase = "draft" | "upcoming" | "submissions" | "judging" | "results";

export function isVisible(event: EventPhaseFields): boolean {
  return event.publishedAt !== null;
}

export function submissionsOpen(event: EventPhaseFields, now: Date): boolean {
  return now >= event.submissionsOpen && now < event.submissionsClose;
}

export function judgingOpen(event: EventPhaseFields, now: Date): boolean {
  return (
    now >= event.submissionsClose &&
    event.resultsPublishedAt === null &&
    (event.judgingClose === null || now < event.judgingClose)
  );
}

export function votingEnabled(event: EventPhaseFields): boolean {
  return event.votingOpen != null && event.votingClose != null;
}

export function votingOpen(event: EventPhaseFields, now: Date): boolean {
  if (!votingEnabled(event)) return false;
  return now >= event.votingOpen! && now < event.votingClose!;
}

export function votingClosed(event: EventPhaseFields, now: Date): boolean {
  if (!votingEnabled(event)) return false;
  return now >= event.votingClose!;
}

export function phase(event: EventPhaseFields, now: Date): EventPhase {
  if (event.publishedAt === null) return "draft";
  if (event.resultsPublishedAt !== null) return "results";
  if (now < event.submissionsOpen) return "upcoming";
  if (now < event.submissionsClose) return "submissions";
  return "judging";
}
