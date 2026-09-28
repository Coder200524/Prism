import { Link } from "react-router-dom";
import { useEvents } from "../../api/hooks/events";
import { RequireRole } from "../../auth/RequireRole";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";

function OrganizerHomeContent() {
  const eventsQuery = useEvents();

  if (eventsQuery.isLoading) return <p className="text-df-dim">Loading…</p>;
  if (eventsQuery.isError) return <ErrorMessage error={eventsQuery.error} />;

  const events = eventsQuery.data?.events ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-df-text">Organize</h1>
        <Link to="/organize/new">
          <Button>New event</Button>
        </Link>
      </div>
      {events.length === 0 ? (
        <EmptyState title="No events" description="Create an event to get started." />
      ) : (
        events.map((event) => (
          <Card key={event.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link
                  to={`/organize/${event.id}`}
                  className="text-lg font-semibold text-df-pink hover:text-df-cyan transition-colors font-mono"
                >
                  {event.name}
                </Link>
                <div className="mt-1">
                  <Badge>{event.phase}</Badge>
                </div>
              </div>
              <Link to={`/organize/${event.id}`}>
                <Button variant="secondary">Settings</Button>
              </Link>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

export function OrganizerHomePage() {
  return (
    <RequireRole platformRoles={["ORGANIZER", "ADMIN"]}>
      <OrganizerHomeContent />
    </RequireRole>
  );
}
