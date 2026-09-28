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
import { DateTimeFields } from "../../../components/DateTimeFields";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Input } from "../../../components/Input";
import { Textarea } from "../../../components/Textarea";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
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
  const [votingOpen, setVotingOpen] = useState("");
  const [votingClose, setVotingClose] = useState("");
  const [trackName, setTrackName] = useState("");
  const [prizeName, setPrizeName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [votingError, setVotingError] = useState<string | null>(null);

  useEffect(() => {
    const event = eventQuery.data?.event;
    if (!event) return;
    setName(event.name);
    setDescription(event.description);
    setSubmissionsOpen(toLocalInput(event.submissionsOpen));
    setSubmissionsClose(toLocalInput(event.submissionsClose));
    setVotingOpen(toLocalInput(event.votingOpen));
    setVotingClose(toLocalInput(event.votingClose));
  }, [eventQuery.data]);

  if (eventQuery.isLoading) return <p className="text-df-dim">Loading settings…</p>;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;
  const event = eventQuery.data?.event;
  if (!event) return null;

  function validateVoting(): string | null {
    if (votingOpen && !votingClose) return "Both voting open and close must be set.";
    if (!votingOpen && votingClose) return "Both voting open and close must be set.";
    if (votingOpen && votingClose) {
      const vo = new Date(votingOpen);
      const vc = new Date(votingClose);
      const sc = new Date(submissionsClose);
      if (vo >= vc) return "Voting open must be before voting close.";
      if (sc > vo) return "Voting open must be on or after submissions close.";
    }
    return null;
  }

  async function onSave(formEvent: FormEvent) {
    formEvent.preventDefault();
    setMessage(null);
    setVotingError(null);
    const vErr = validateVoting();
    if (vErr) {
      setVotingError(vErr);
      return;
    }
    await updateEvent.mutateAsync({
      name,
      description,
      submissionsOpen: new Date(submissionsOpen).toISOString(),
      submissionsClose: new Date(submissionsClose).toISOString(),
      votingOpen: votingOpen ? new Date(votingOpen).toISOString() : null,
      votingClose: votingClose ? new Date(votingClose).toISOString() : null,
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
          <DateTimeFields
            idPrefix="submissions-open"
            dateLabel="Submissions open (date)"
            timeLabel="Submissions open (time)"
            value={submissionsOpen}
            onChange={setSubmissionsOpen}
            required
          />
          <DateTimeFields
            idPrefix="submissions-close"
            dateLabel="Submissions close (date)"
            timeLabel="Submissions close (time)"
            value={submissionsClose}
            onChange={setSubmissionsClose}
            required
          />
          <div className="rounded border border-df-border p-3">
            <p className="mb-2 text-sm font-medium text-df-text">
              Community voting (optional)
            </p>
            <div className="space-y-3">
              <DateTimeFields
                idPrefix="voting-open"
                dateLabel="Voting opens (date)"
                timeLabel="Voting opens (time)"
                value={votingOpen}
                onChange={setVotingOpen}
              />
              <DateTimeFields
                idPrefix="voting-close"
                dateLabel="Voting closes (date)"
                timeLabel="Voting closes (time)"
                value={votingClose}
                onChange={setVotingClose}
              />
              {votingError ? (
                <p className="text-sm text-df-pink">{votingError}</p>
              ) : null}
              <p className="text-xs text-df-dim">
                Leave both blank to disable community voting. Voting open must be on or after submissions close.
              </p>
            </div>
          </div>
          {updateEvent.isError ? <ErrorMessage error={updateEvent.error} /> : null}
          {message ? <p className="text-sm text-df-cyan">{message}</p> : null}
          <Button type="submit" disabled={updateEvent.isPending}>
            Save settings
          </Button>
        </form>
      </Card>

      <Card
        title="Publish"
        actions={
          event.publishedAt ? (
            <span className="text-sm text-df-cyan">Published</span>
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
        <p className="text-sm text-df-dim">
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
