import { Link, useParams } from "react-router-dom";
import { useEvent } from "../../api/hooks/events";
import { useCommunityResults } from "../../api/hooks/community";
import { ApiError } from "../../api/client";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Table } from "../../components/Table";
import { DateTime } from "../../lib/datetime";

export function CommunityResultsPage() {
  const { eventId = "" } = useParams();
  const eventQuery = useEvent(eventId);
  const resultsQuery = useCommunityResults(eventId);

  if (eventQuery.isLoading || resultsQuery.isLoading)
    return <p className="text-slate-600">Loading…</p>;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;

  const event = eventQuery.data?.event;
  if (!event) return <EmptyState title="Event not found" />;

  const votingClosed = event.votingClose && new Date(event.votingClose) <= new Date();

  if (resultsQuery.isError) {
    const err = resultsQuery.error;
    if (err instanceof ApiError && err.code === "results_hidden") {
      return (
        <div className="space-y-4">
          <div>
            <Link to={`/events/${eventId}`} className="text-sm text-indigo-600 hover:underline">
              Back to event
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Community Results</h1>
          </div>
          <EmptyState
            title="Results are hidden"
            description={
              event.votingClose
                ? `Results will be available after voting closes on ${new Date(event.votingClose).toLocaleString()}.`
                : "Results are not yet available."
            }
          />
        </div>
      );
    }
    return <ErrorMessage error={err} />;
  }

  const data = resultsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/events/${eventId}`} className="text-sm text-indigo-600 hover:underline">
          Back to event
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Community Results</h1>
        {votingClosed && event.votingClose ? (
          <p className="mt-1 text-sm text-slate-600">
            Voting closed: <DateTime value={event.votingClose} />
          </p>
        ) : null}
      </div>

      {!data || data.tracks.length === 0 ? (
        <EmptyState title="No results yet" />
      ) : (
        data.tracks.map((track) => (
          <Card key={track.trackId} title={track.trackName}>
            {track.projects.length === 0 ? (
              <EmptyState title="No votes in this track" />
            ) : (
              <Table
                rows={track.projects}
                rowKey={(row) => row.projectId}
                columns={[
                  { key: "rank", header: "#", render: (row) => row.rank },
                  { key: "title", header: "Project", render: (row) => row.title },
                  { key: "votes", header: "Votes", render: (row) => row.votes },
                  {
                    key: "flagged",
                    header: "Flagged excluded",
                    render: (row) => row.flaggedExcluded || "—",
                  },
                ]}
              />
            )}
          </Card>
        ))
      )}
    </div>
  );
}
