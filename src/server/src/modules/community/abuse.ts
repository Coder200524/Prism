export const ABUSE_THRESHOLDS = {
  SHARED_IP_MIN_VOTERS: 3,
  SHARED_IP_TIME_WINDOW_MS: 10 * 60 * 1000,
  RAPID_VOTING_TIME_WINDOW_MS: 10 * 1000,
};

export interface AbuseCheckParams {
  voterCreatedAt: Date;
  eventVotingOpen: Date | null;
  ipVoterCountInWindow: number;
  voterVoteTimes: Date[];
  totalTracksInEvent: number;
}

export function checkAbuse(params: AbuseCheckParams): { flagged: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // new_account
  if (params.eventVotingOpen && params.voterCreatedAt > params.eventVotingOpen) {
    reasons.push("new_account");
  }

  // shared_ip_burst
  if (params.ipVoterCountInWindow > ABUSE_THRESHOLDS.SHARED_IP_MIN_VOTERS) {
    reasons.push("shared_ip_burst");
  }

  // rapid_voting
  if (
    params.totalTracksInEvent > 0 &&
    params.voterVoteTimes.length >= params.totalTracksInEvent
  ) {
    const times = params.voterVoteTimes.map((d) => d.getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    if (maxTime - minTime <= ABUSE_THRESHOLDS.RAPID_VOTING_TIME_WINDOW_MS) {
      reasons.push("rapid_voting");
    }
  }

  return {
    flagged: reasons.length > 0,
    reasons,
  };
}
