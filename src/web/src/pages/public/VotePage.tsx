import { useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { useBallot, useCastVote, useRetractVote } from "../../api/hooks/community";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Countdown } from "../../components/Countdown";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "own_project") return "You cannot vote for your own project.";
    if (err.code === "not_eligible") return "You are not eligible to vote in this event.";
    if (err.code === "voting_closed") return "Voting is closed.";
    if (err.code === "rate_limit") return "Too many requests. Please wait a moment.";
    if (err.status === 429) return "Too many requests. Please wait a moment.";
    return err.message;
  }
  return "Something went wrong.";
}

function TrackBallot({
  eventId,
  trackId,
  trackName,
  projects,
  currentVote,
}: {
  eventId: string;
  trackId: string;
  trackName: string;
  projects: Array<{ id: string; title: string; summary: string; teamName: string }>;
  currentVote: string | undefined;
}) {
  const [selected, setSelected] = useState<string | undefined>(currentVote);
  const castVote = useCastVote(eventId);
  const retractVote = useRetractVote(eventId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hasChanged = selected !== currentVote;

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      if (selected) {
        await castVote.mutateAsync(selected);
      } else if (currentVote) {
        await retractVote.mutateAsync(trackId);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={trackName}>
      <fieldset className="space-y-2">
        <legend className="sr-only">{`Vote for ${trackName}`}</legend>
        {projects.map((project) => (
          <label
            key={project.id}
            className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm transition-colors ${
              selected === project.id
                ? "border-df-cyan bg-df-cyan/10"
                : "border-df-border hover:bg-df-panel"
            }`}
          >
            <input
              type="radio"
              name={`track-${trackId}`}
              value={project.id}
              checked={selected === project.id}
              onChange={() => setSelected(project.id)}
              className="mt-0.5 accent-df-cyan"
            />
            <div>
              <span className="font-medium text-df-text">{project.title}</span>
              <span className="ml-2 text-df-dim">by {project.teamName}</span>
              <p className="mt-1 text-df-dim">{project.summary}</p>
            </div>
          </label>
        ))}
        {currentVote ? (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded border p-3 text-sm transition-colors ${
              selected === undefined
                ? "border-df-cyan bg-df-cyan/10"
                : "border-df-border hover:bg-df-panel"
            }`}
          >
            <input
              type="radio"
              name={`track-${trackId}`}
              value=""
              checked={selected === undefined}
              onChange={() => setSelected(undefined)}
              className="mt-0.5 accent-df-cyan"
            />
            <span className="text-df-dim">Retract my vote</span>
          </label>
        ) : null}
      </fieldset>
      {error ? (
        <p className="mt-2 rounded border border-red-200 bg-df-panel px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <Button
          disabled={!hasChanged || saving}
          onClick={() => void onSave()}
        >
          {saving ? "Saving…" : "Save vote"}
        </Button>
        {currentVote && !hasChanged ? (
          <Badge tone="green">Voted</Badge>
        ) : null}
      </div>
    </Card>
  );
}

export function VotePage() {
  const { eventId = "" } = useParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const ballotQuery = useBallot(eventId);

  if (authLoading) return <p className="text-df-dim">Loading…</p>;
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(`/events/${eventId}/vote`)}`} replace />;

  if (ballotQuery.isLoading) return <p className="text-df-dim">Loading ballot…</p>;
  if (ballotQuery.isError) {
    const err = ballotQuery.error;
    if (err instanceof ApiError) {
      if (err.code === "not_eligible")
        return <EmptyState title="Not eligible" description="Judges, organizers, and participants with submissions in this event cannot vote." />;
      if (err.code === "voting_closed")
        return <EmptyState title="Voting closed" description="Voting is not currently open for this event." />;
    }
    return <ErrorMessage error={err} />;
  }

  const ballot = ballotQuery.data;
  if (!ballot) return <EmptyState title="No ballot data" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/events/${eventId}`} className="text-sm text-df-pink hover:text-df-cyan transition-colors font-mono">
          ← Back to event
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-df-text">Community Vote</h1>
        {ballot.isOpen ? (
          <Countdown to={ballot.votingClose} label="Voting closes in" />
        ) : (
          <p className="mt-1 text-sm text-df-dim">Voting is closed.</p>
        )}
        <p className="mt-2 text-xs text-df-dim">
          Order is randomised for each voter.
        </p>
      </div>

      {!ballot.isOpen ? (
        <EmptyState title="Voting is closed" description="You can no longer cast or change votes." />
      ) : ballot.tracks.length === 0 ? (
        <EmptyState title="No tracks to vote on" />
      ) : (
        ballot.tracks.map((track) => (
          <TrackBallot
            key={track.trackId}
            eventId={eventId}
            trackId={track.trackId}
            trackName={track.trackName}
            projects={track.projects}
            currentVote={ballot.myVotes[track.trackId]}
          />
        ))
      )}
    </div>
  );
}
