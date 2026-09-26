import { Link, useSearchParams } from "react-router-dom";
import { useEvents } from "../../api/hooks/events";
import { useGallery } from "../../api/hooks/projects";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";

export function GalleryPage() {
  const [params, setParams] = useSearchParams();
  const eventId = params.get("eventId") ?? "";
  const trackId = params.get("trackId") ?? "";
  const q = params.get("q") ?? "";

  const eventsQuery = useEvents();
  const galleryQuery = useGallery({
    eventId: eventId || undefined,
    trackId: trackId || undefined,
    q: q || undefined,
    pageSize: 100,
  });

  const selectedEvent = eventsQuery.data?.events.find((event) => event.id === eventId);
  const trackOptions = [
    { value: "", label: "All tracks" },
    ...(selectedEvent?.tracks.map((track) => ({ value: track.id, label: track.name })) ?? []),
  ];

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "eventId") next.delete("trackId");
    setParams(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Gallery</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <Input
          label="Search"
          value={q}
          onChange={(event) => update("q", event.target.value)}
          placeholder="Title or summary"
        />
        <Select
          label="Event"
          value={eventId}
          onChange={(event) => update("eventId", event.target.value)}
          options={[
            { value: "", label: "All events" },
            ...(eventsQuery.data?.events.map((event) => ({
              value: event.id,
              label: event.name,
            })) ?? []),
          ]}
        />
        <Select
          label="Track"
          value={trackId}
          onChange={(event) => update("trackId", event.target.value)}
          options={trackOptions}
          disabled={!eventId}
        />
      </div>

      {galleryQuery.isLoading ? <p className="text-slate-600">Loading projects…</p> : null}
      {galleryQuery.isError ? <ErrorMessage error={galleryQuery.error} /> : null}

      {galleryQuery.data && galleryQuery.data.items.length === 0 ? (
        <EmptyState title="No projects found" description="Try adjusting filters." />
      ) : null}

      <div className="grid gap-3">
        {galleryQuery.data?.items.map((project) => (
          <Card key={project.id}>
            <Link
              to={`/projects/${project.id}`}
              className="text-lg font-semibold text-indigo-600 hover:underline"
            >
              {project.title}
            </Link>
            <p className="mt-1 text-sm text-slate-600">{project.summary}</p>
            <p className="mt-2 text-xs text-slate-500">
              {project.teamName ?? "Team"} · {project.trackName ?? "No track"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
