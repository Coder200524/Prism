import { Link, useParams } from "react-router-dom";
import { useEvent } from "../../api/hooks/events";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Countdown } from "../../components/Countdown";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DateTime } from "../../lib/datetime";

export function EventPage() {
  const { eventId } = useParams();
  const { isAuthenticated, hasEventRole, hasPlatformRole } = useAuth();
  const eventQuery = useEvent(eventId);

  if (eventQuery.isLoading) return <p className="text-slate-600">Loading event…</p>;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;
  const event = eventQuery.data?.event;
  if (!event) return <EmptyState title="Event not found" />;

  const canOrganize = hasPlatformRole("ADMIN") || hasEventRole("ORGANIZER", event.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{event.name}</h1>
          <div className="mt-2">
            <Badge>{event.phase}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/gallery?eventId=${event.id}`}>
            <Button variant="secondary">Gallery</Button>
          </Link>
          {isAuthenticated ? (
            <Link to={`/events/${event.id}/team/new`}>
              <Button>Create team</Button>
            </Link>
          ) : null}
          {event.resultsPublishedAt ? (
            <Link to={`/events/${event.id}/results`}>
              <Button variant="secondary">Results</Button>
            </Link>
          ) : null}
          {canOrganize ? (
            <Link to={`/organize/${event.id}`}>
              <Button variant="secondary">Manage</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <Card title="About">
        <p className="whitespace-pre-wrap text-slate-700">{event.description || "No description."}</p>
        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <p>
            Opens: <DateTime value={event.submissionsOpen} />
          </p>
          <p>
            Closes: <DateTime value={event.submissionsClose} />
          </p>
          <Countdown to={event.submissionsClose} label="Time left" />
        </div>
      </Card>

      <Card title="Tracks">
        {event.tracks.length === 0 ? (
          <EmptyState title="No tracks" />
        ) : (
          <ul className="space-y-2 text-sm">
            {event.tracks.map((track) => (
              <li key={track.id}>
                <span className="font-medium text-slate-900">{track.name}</span>
                {track.description ? (
                  <span className="text-slate-600"> — {track.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Prizes">
        {event.prizes.length === 0 ? (
          <EmptyState title="No prizes listed" />
        ) : (
          <ul className="space-y-2 text-sm">
            {event.prizes.map((prize) => (
              <li key={prize.id}>
                <span className="font-medium text-slate-900">{prize.name}</span>
                {prize.value ? <span className="text-slate-600"> ({prize.value})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
