import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateEvent } from "../../api/hooks/events";
import { RequireRole } from "../../auth/RequireRole";
import { Button } from "../../components/Button";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Input } from "../../components/Input";
import { Textarea } from "../../components/Textarea";

function EventFormContent() {
  const navigate = useNavigate();
  const createEvent = useCreateEvent();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submissionsOpen, setSubmissionsOpen] = useState("");
  const [submissionsClose, setSubmissionsClose] = useState("");
  const [trackName, setTrackName] = useState("General");
  const [prizeName, setPrizeName] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const openIso = new Date(submissionsOpen).toISOString();
    const closeIso = new Date(submissionsClose).toISOString();
    const result = await createEvent.mutateAsync({
      name,
      description,
      submissionsOpen: openIso,
      submissionsClose: closeIso,
      maxTeamSize: 4,
      reviewsPerProject: 3,
      tracks: trackName ? [{ name: trackName, description: "" }] : [],
      prizes: prizeName ? [{ name: prizeName, description: "", value: "" }] : [],
    });
    navigate(`/organize/${result.event.id}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">New event</h1>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
        <Input
          label="First track"
          value={trackName}
          onChange={(e) => setTrackName(e.target.value)}
        />
        <Input
          label="First prize (optional)"
          value={prizeName}
          onChange={(e) => setPrizeName(e.target.value)}
        />
        {createEvent.isError ? <ErrorMessage error={createEvent.error} /> : null}
        <Button type="submit" disabled={createEvent.isPending}>
          {createEvent.isPending ? "Creating…" : "Create event"}
        </Button>
      </form>
    </div>
  );
}

export function EventFormPage() {
  return (
    <RequireRole platformRoles={["ORGANIZER", "ADMIN"]}>
      <EventFormContent />
    </RequireRole>
  );
}
