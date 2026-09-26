export type EventSummary = {
  id: string;
  name: string;
  description: string;
  submissionsOpen: string;
  submissionsClose: string;
  judgingClose: string | null;
  votingOpen: string | null;
  votingClose: string | null;
  publishedAt: string | null;
  resultsPublishedAt: string | null;
  maxTeamSize: number;
  reviewsPerProject: number;
  createdAt: string;
  phase: string;
  tracks: Array<{ id: string; eventId: string; name: string; description: string }>;
  prizes: Array<{
    id: string;
    eventId: string;
    trackId: string | null;
    name: string;
    description: string;
    value: string;
    place: number | null;
  }>;
};

export type GalleryProject = {
  id: string;
  eventId: string;
  teamId: string;
  trackId: string | null;
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl: string;
  status: string;
  submittedAt: string | null;
  trackName: string | null;
  teamName: string | null;
};

export type Team = {
  id: string;
  eventId: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  members: Array<{
    userId: string;
    joinedAt: string;
    user: { id: string; email: string; name: string };
  }>;
  project: {
    id: string;
    title: string;
    status: string;
    submittedAt: string | null;
  } | null;
  event?: { id: string; name: string; maxTeamSize: number };
};

export type ProjectDetail = {
  id: string;
  eventId: string;
  teamId: string;
  trackId: string | null;
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl: string;
  status: string;
  submittedAt: string | null;
  duplicateOfId: string | null;
  trackName: string | null;
  teamName: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  platformRole: "USER" | "ORGANIZER" | "ADMIN";
  createdAt: string;
};

export type Criterion = {
  id: string;
  eventId: string;
  key: string;
  name: string;
  description: string;
  weight: number;
  minScore: number;
  maxScore: number;
  position: number;
};

export type JudgeRow = {
  id: string;
  name: string;
  email: string;
  trackIds: string[];
  assigned: number;
  submitted: number;
};

export type AssignmentRow = {
  id: string;
  judgeId: string;
  judgeName: string;
  projectId: string;
  projectTitle: string;
  trackId: string | null;
  status: string;
  submittedAt: string | null;
};

export type Dashboard = {
  generatedAt: string;
  totals: {
    projects: number;
    assignments: number;
    submitted: number;
    pending: number;
    percentComplete: number;
    targetCoverage: number;
    coveragePercent: number;
  };
  judges: Array<{
    id: string;
    name: string;
    assigned: number;
    submitted: number;
    flatScorer: boolean;
    lowSample: boolean;
  }>;
  projects: Array<{
    id: string;
    title: string;
    track: string | null;
    assigned: number;
    submitted: number;
  }>;
  flags: Array<{ type: string; targetId: string; message: string }>;
};

export type ResultsTrack = {
  trackId: string | null;
  trackName: string | null;
  projects: Array<{
    id: string;
    title: string;
    teamName: string | null;
    rank: number | null;
    reviewCount: number;
    rawScore: number | null;
    normalizedScore: number | null;
    flags?: string[];
    criterionAverages?: Record<string, number | null>;
  }>;
};

export type ResultsResponse = {
  results: {
    tracks: ResultsTrack[];
    flatScorerJudgeIds?: string[];
    lowSampleJudgeIds?: string[];
  };
  published: boolean;
};

export type JudgeAssignmentSummary = {
  id: string;
  eventId: string;
  eventName: string;
  status: string;
  comment: string;
  submittedAt: string | null;
  project: {
    id: string;
    title: string;
    summary: string;
    trackId: string | null;
    repoUrl: string;
    demoUrl: string;
  };
  scores: Record<string, number>;
};

export type JudgeAssignmentDetail = {
  id: string;
  eventId: string;
  status: string;
  comment: string;
  submittedAt: string | null;
  project: {
    id: string;
    title: string;
    summary: string;
    repoUrl: string;
    demoUrl: string;
    trackId: string | null;
  };
  criteria: Criterion[];
  scores: Record<string, number>;
};

export type JudgeScoreItem = {
  assignmentId: string;
  eventId: string;
  projectId: string;
  projectTitle: string;
  status: string;
  comment: string;
  scores: Record<string, number>;
  weightedTotal: number | null;
  submittedAt: string | null;
};

export type AuditItem = {
  id: string;
  at: string;
  action: string;
  actor: { id: string; name: string; email: string } | null;
  targetType: string;
  targetId: string | null;
  summary: string;
};

export type BallotTrack = {
  trackId: string;
  trackName: string;
  projects: Array<{
    id: string;
    title: string;
    summary: string;
    teamName: string;
  }>;
};

export type BallotResponse = {
  votingOpen: string;
  votingClose: string;
  isOpen: boolean;
  tracks: BallotTrack[];
  myVotes: Record<string, string>;
};

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
};

export type CommunityResultsTrack = {
  trackId: string;
  trackName: string;
  projects: Array<{
    rank: number;
    projectId: string;
    title: string;
    votes: number;
    flaggedExcluded: number;
  }>;
};

export type CommunityResultsResponse = {
  tracks: CommunityResultsTrack[];
};

export type CommunityTurnout = {
  totalVotes: number;
  uniqueVoters: number;
  flaggedCount: number;
};

export type FlaggedVote = {
  id: string;
  voterId: string;
  voterName: string;
  projectId: string;
  projectTitle: string;
  trackName: string;
  flags: string[];
  voided: boolean;
  createdAt: string;
};

export type EventComment = {
  id: string;
  body: string;
  createdAt: string;
  projectId: string;
  projectTitle: string;
  author: { id: string; name: string };
  hiddenAt: string | null;
  hiddenReason: string | null;
};
