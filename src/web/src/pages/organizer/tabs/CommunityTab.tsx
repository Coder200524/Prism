import { useState } from "react";
import {
  useCommunityTurnout,
  useEventComments,
  useFlaggedVotes,
  useHideComment,
  useRestoreVote,
  useUnhideComment,
  useVoidVote,
} from "../../../api/hooks/community";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Table } from "../../../components/Table";
import { formatDateTime } from "../../../lib/datetime";

function TurnoutCard({ eventId }: { eventId: string }) {
  const turnoutQuery = useCommunityTurnout(eventId, true);

  if (turnoutQuery.isLoading) return <p className="text-df-dim">Loading turnout…</p>;
  if (turnoutQuery.isError) return <ErrorMessage error={turnoutQuery.error} />;
  const t = turnoutQuery.data;
  if (!t) return null;

  return (
    <Card title="Turnout">
      <p className="mb-2 text-xs text-df-dim">Auto-refreshes every 5 seconds</p>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-df-dim">Total votes</dt>
          <dd className="text-lg font-semibold">{t.totalVotes}</dd>
        </div>
        <div>
          <dt className="text-df-dim">Unique voters</dt>
          <dd className="text-lg font-semibold">{t.uniqueVoters}</dd>
        </div>
        <div>
          <dt className="text-df-dim">Flagged</dt>
          <dd className="text-lg font-semibold">{t.flaggedCount}</dd>
        </div>
      </dl>
    </Card>
  );
}

function FlaggedVotesCard({ eventId }: { eventId: string }) {
  const flaggedQuery = useFlaggedVotes(eventId);
  const voidVote = useVoidVote(eventId);
  const restoreVote = useRestoreVote(eventId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (flaggedQuery.isLoading) return <p className="text-df-dim">Loading flagged votes…</p>;
  if (flaggedQuery.isError) return <ErrorMessage error={flaggedQuery.error} />;
  const votes = flaggedQuery.data ?? [];

  async function handleVoid(voteId: string) {
    const reason = window.prompt("Reason for voiding this vote:");
    if (!reason) return;
    setPendingId(voteId);
    try {
      await voidVote.mutateAsync({ voteId, reason });
    } finally {
      setPendingId(null);
    }
  }

  async function handleRestore(voteId: string) {
    setPendingId(voteId);
    try {
      await restoreVote.mutateAsync(voteId);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card title="Flagged votes">
      {votes.length === 0 ? (
        <EmptyState title="No flagged votes" />
      ) : (
        <>
          {voidVote.isError ? <ErrorMessage error={voidVote.error} /> : null}
          {restoreVote.isError ? <ErrorMessage error={restoreVote.error} /> : null}
          <Table
            rows={votes}
            rowKey={(row) => row.id}
            columns={[
              { key: "voter", header: "Voter", render: (row) => row.voterName },
              { key: "project", header: "Project", render: (row) => row.projectTitle },
              { key: "track", header: "Track", render: (row) => row.trackName },
              {
                key: "flags",
                header: "Flags",
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {row.flags.map((f) => (
                      <Badge key={f} tone="amber">{f}</Badge>
                    ))}
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (row) =>
                  row.voided ? <Badge tone="red">voided</Badge> : <Badge tone="green">active</Badge>,
              },
              { key: "at", header: "Voted", render: (row) => formatDateTime(row.createdAt) },
              {
                key: "action",
                header: "",
                render: (row) =>
                  row.voided ? (
                    <Button
                      variant="secondary"
                      disabled={pendingId === row.id}
                      onClick={() => void handleRestore(row.id)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={pendingId === row.id}
                      onClick={() => void handleVoid(row.id)}
                    >
                      Void
                    </Button>
                  ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function CommentModerationCard({ eventId }: { eventId: string }) {
  const commentsQuery = useEventComments(eventId);
  const hideComment = useHideComment(eventId);
  const unhideComment = useUnhideComment(eventId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (commentsQuery.isLoading) return <p className="text-df-dim">Loading comments…</p>;
  if (commentsQuery.isError) return <ErrorMessage error={commentsQuery.error} />;
  const comments = commentsQuery.data ?? [];

  async function handleHide(commentId: string) {
    const reason = window.prompt("Reason for hiding this comment:");
    if (!reason) return;
    setPendingId(commentId);
    try {
      await hideComment.mutateAsync({ commentId, reason });
    } finally {
      setPendingId(null);
    }
  }

  async function handleUnhide(commentId: string) {
    setPendingId(commentId);
    try {
      await unhideComment.mutateAsync(commentId);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card title="Comment moderation">
      {comments.length === 0 ? (
        <EmptyState title="No comments" />
      ) : (
        <>
          {hideComment.isError ? <ErrorMessage error={hideComment.error} /> : null}
          {unhideComment.isError ? <ErrorMessage error={unhideComment.error} /> : null}
          <Table
            rows={comments}
            rowKey={(row) => row.id}
            columns={[
              { key: "author", header: "Author", render: (row) => row.author.name },
              { key: "project", header: "Project", render: (row) => row.projectTitle },
              {
                key: "body",
                header: "Comment",
                render: (row) => (
                  <span className="line-clamp-2 max-w-xs text-df-text">{row.body}</span>
                ),
              },
              { key: "at", header: "Posted", render: (row) => formatDateTime(row.createdAt) },
              {
                key: "status",
                header: "Status",
                render: (row) =>
                  row.hiddenAt ? (
                    <div>
                      <Badge tone="red">hidden</Badge>
                      {row.hiddenReason ? (
                        <span className="ml-1 text-xs text-df-dim">{row.hiddenReason}</span>
                      ) : null}
                    </div>
                  ) : (
                    <Badge tone="green">visible</Badge>
                  ),
              },
              {
                key: "action",
                header: "",
                render: (row) =>
                  row.hiddenAt ? (
                    <Button
                      variant="secondary"
                      disabled={pendingId === row.id}
                      onClick={() => void handleUnhide(row.id)}
                    >
                      Unhide
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={pendingId === row.id}
                      onClick={() => void handleHide(row.id)}
                    >
                      Hide
                    </Button>
                  ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}

export function CommunityTab({ eventId }: { eventId: string }) {
  return (
    <div className="space-y-6">
      <TurnoutCard eventId={eventId} />
      <FlaggedVotesCard eventId={eventId} />
      <CommentModerationCard eventId={eventId} />
    </div>
  );
}
