import { Link } from "react-router-dom";
import { useEvents } from "../../api/hooks/events";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DateTime } from "../../lib/datetime";

function phaseTone(phase: string): "slate" | "indigo" | "green" | "amber" | "red" {
  switch (phase) {
    case "submissions":
      return "green";
    case "judging":
      return "amber";
    case "results":
      return "indigo";
    case "upcoming":
      return "slate";
    default:
      return "slate";
  }
}

export function EventsPage() {
  const eventsQuery = useEvents();

  if (eventsQuery.isLoading) return <p className="text-df-dim font-mono">Loading events…</p>;
  if (eventsQuery.isError) return <ErrorMessage error={eventsQuery.error} />;

  const events = eventsQuery.data?.events ?? [];
  if (events.length === 0) {
    return <EmptyState title="No events yet" description="Published events will appear here." />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-display uppercase tracking-widest text-df-text">Events</h1>
      <div className="grid gap-4">
        {events.map((event) => (
          <Card key={event.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link
                  to={`/events/${event.id}`}
                  className="text-lg font-bold text-df-pink hover:text-df-cyan transition-colors font-mono"
                >
                  {event.name}
                </Link>
                <p className="mt-1 text-sm text-df-dim line-clamp-2 font-mono">{event.description || "—"}</p>
              </div>
              <Badge tone={phaseTone(event.phase)}>{event.phase}</Badge>
            </div>
            <div className="mt-3 text-sm text-df-dim font-mono">
              <div>Submission starts at: <DateTime value={event.submissionsOpen} /></div>
              <div>Deadline: <DateTime value={event.submissionsClose} /></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
