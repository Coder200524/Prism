import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCreateTeam } from "../../api/hooks/teams";
import { RequireRole } from "../../auth/RequireRole";
import { Button } from "../../components/Button";
import { CopyLink } from "../../components/CopyLink";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Input } from "../../components/Input";

function CreateTeamForm() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const createTeam = useCreateTeam(eventId);
  const [name, setName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await createTeam.mutateAsync({ name });
    setInviteUrl(result.inviteUrl);
  }

  if (inviteUrl) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Team created</h1>
        <p className="text-sm text-slate-600">Share this invite link with teammates:</p>
        <CopyLink value={inviteUrl} />
        <Button type="button" onClick={() => navigate("/teams")}>
          Go to my teams
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Create team</h1>
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <Input
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {createTeam.isError ? <ErrorMessage error={createTeam.error} /> : null}
        <Button type="submit" disabled={createTeam.isPending}>
          {createTeam.isPending ? "Creating…" : "Create team"}
        </Button>
      </form>
      <Link to={`/events/${eventId}`} className="text-sm text-indigo-600 hover:underline">
        Back to event
      </Link>
    </div>
  );
}

export function CreateTeamPage() {
  return (
    <RequireRole>
      <CreateTeamForm />
    </RequireRole>
  );
}
