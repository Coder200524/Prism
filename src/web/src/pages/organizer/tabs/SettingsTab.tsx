import { useEffect, useState, type FormEvent } from "react";
import {
  useCreatePrize,
  useCreateTrack,
  useDeletePrize,
  useDeleteTrack,
  useEvent,
  usePublishEvent,
  useUpdateEvent,
} from "../../../api/hooks/events";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Input } from "../../../components/Input";
import { Textarea } from "../../../components/Textarea";

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SettingsTab({ eventId }: { eventId: string }) {
  const eventQuery = useEvent(eventId);
  const updateEvent = useUpdateEvent(eventId);
  const publishEvent = usePublishEvent(eventId);
  const createTrack = useCreateTrack(eventId);
  const deleteTrack = useDeleteTrack(eventId);
  const createPrize = useCreatePrize(eventId);
  const deletePrize = useDeletePrize(eventId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submissionsOpen, setSubmissionsOpen] = useState("");
  const [submissionsClose, setSubmissionsClose] = useState("");
  const [trackName, setTrackName] = useState("");
  const [prizeName, setPrizeName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const event = eventQuery.data?.event;
    if (!event) return;
    setName(event.name);
    setDescription(event.description);
    setSubmissionsOpen(toLocalInput(event.submissionsOpen));
    setSubmissionsClose(toLocalInput(event.submissionsClose));
  }, [eventQuery.data]);

  if (eventQuery.isLoading) return <p className="text-slate-600">Loading settings…</p>;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;
  const event = eventQuery.data?.event;
  if (!event) return null;

  async function onSave(formEvent: FormEvent) {
    formEvent.preventDefault();
    setMessage(null);
    await updateEvent.mutateAsync({
      name,
      description,
      submissionsOpen: new Date(submissionsOpen).toISOString(),
      submissionsClose: new Date(submissionsClose).toISOString(),
    });
    setMessage("Settings saved.");
  }

  return (
    <div className="space-y-6">
      <Card title="Event details">
        <form onSubmit={(e) => void onSave(e)} className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            label="Submissions open"
            type="datetime-local"
            value={submissionsOpen}
            onChange={(e) => setSubmissionsOpen(e.target.value)}
            required
          />
          <Input
            label="Submissions close"
            type="datetime-local"
            value={submissionsClose}
            onChange={(e) => setSubmissionsClose(e.target.value)}
            required
          />
          {updateEvent.isError ? <ErrorMessage error={updateEvent.error} /> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          <Button type="submit" disabled={updateEvent.isPending}>
            Save settings
          </Button>
        </form>
      </Card>

      <Card
        title="Publish"
        actions={
          event.publishedAt ? (
            <span className="text-sm text-green-700">Published</span>
          ) : (
            <Button
              type="button"
              disabled={publishEvent.isPending}
              onClick={() => void publishEvent.mutateAsync()}
            >
              Publish event
            </Button>
          )
        }
      >
        {publishEvent.isError ? <ErrorMessage error={publishEvent.error} /> : null}
        <p className="text-sm text-slate-600">
          Published events appear in the public list and gallery.
        </p>
      </Card>

      <Card title="Tracks">
        <ul className="mb-4 space-y-2 text-sm">
          {event.tracks.map((track) => (
            <li key={track.id} className="flex items-center justify-between gap-2">
              <span>{track.name}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void deleteTrack.mutateAsync(track.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createTrack.mutateAsync({ name: trackName }).then(() => setTrackName(""));
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <Input
              label="New track"
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              required
            />
          </div>
          <Button type="submit">Add track</Button>
        </form>
        {createTrack.isError || deleteTrack.isError ? (
          <div className="mt-2">
            <ErrorMessage error={createTrack.error ?? deleteTrack.error} />
          </div>
        ) : null}
      </Card>

      <Card title="Prizes">
        <ul className="mb-4 space-y-2 text-sm">
          {event.prizes.map((prize) => (
            <li key={prize.id} className="flex items-center justify-between gap-2">
              <span>{prize.name}</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void deletePrize.mutateAsync(prize.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createPrize.mutateAsync({ name: prizeName }).then(() => setPrizeName(""));
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <Input
              label="New prize"
              value={prizeName}
              onChange={(e) => setPrizeName(e.target.value)}
              required
            />
          </div>
          <Button type="submit">Add prize</Button>
        </form>
        {createPrize.isError || deletePrize.isError ? (
          <div className="mt-2">
            <ErrorMessage error={createPrize.error ?? deletePrize.error} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
