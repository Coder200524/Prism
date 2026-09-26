import { Link, useParams } from "react-router-dom";
import { useEvent } from "../../api/hooks/events";
import { useEventResults } from "../../api/hooks/judging";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Table } from "../../components/Table";

export function ResultsPage() {
  const { eventId = "" } = useParams();
  const eventQuery = useEvent(eventId);
  const resultsQuery = useEventResults(eventId);

  if (eventQuery.isLoading || resultsQuery.isLoading) {
    return <p className="text-slate-600">Loading results…</p>;
  }
  if (resultsQuery.isError) return <ErrorMessage error={resultsQuery.error} />;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;

  const event = eventQuery.data?.event;
  const tracks = resultsQuery.data?.results.tracks ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/events/${eventId}`} className="text-sm text-indigo-600 hover:underline">
          Back to event
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {event?.name ?? "Event"} — Results
        </h1>
      </div>

      {tracks.length === 0 ? (
        <EmptyState title="No results" />
      ) : (
        tracks.map((track) => (
          <Card key={track.trackId ?? "none"} title={track.trackName ?? "No track"}>
            {track.projects.length === 0 ? (
              <EmptyState title="No projects in this track" />
            ) : (
              <Table
                rows={track.projects}
                rowKey={(row) => row.id}
                columns={[
                  { key: "rank", header: "Rank", render: (row) => row.rank ?? "—" },
                  {
                    key: "title",
                    header: "Title",
                    render: (row) => (
                      <Link
                        to={`/projects/${row.id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {row.title}
                      </Link>
                    ),
                  },
                  {
                    key: "team",
                    header: "Team",
                    render: (row) => row.teamName ?? "—",
                  },
                  {
                    key: "reviews",
                    header: "Reviews",
                    render: (row) => row.reviewCount,
                  },
                  {
                    key: "raw",
                    header: "Raw",
                    render: (row) => row.rawScore ?? "—",
                  },
                  {
                    key: "normalized",
                    header: "Normalized",
                    render: (row) => row.normalizedScore ?? "—",
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
