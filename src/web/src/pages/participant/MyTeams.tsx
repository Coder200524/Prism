import { Link } from "react-router-dom";
import { useMyTeams, useRotateInvite } from "../../api/hooks/teams";
import { RequireRole } from "../../auth/RequireRole";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CopyLink } from "../../components/CopyLink";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";

function TeamCard({
  team,
}: {
  team: {
    id: string;
    name: string;
    inviteCode: string;
    eventId: string;
    event?: { name: string };
    members: Array<{ user: { id: string; name: string; email: string } }>;
    project: { id: string; title: string; status: string } | null;
  };
}) {
  const rotate = useRotateInvite(team.id);
  const inviteUrl = `${window.location.origin}/join/${team.inviteCode}`;

  return (
    <Card title={team.name}>
      <p className="text-sm text-slate-600">{team.event?.name ?? team.eventId}</p>
      <div className="mt-3 space-y-2 text-sm">
        <p className="font-medium text-slate-800">Members</p>
        <ul className="list-disc pl-5 text-slate-700">
          {team.members.map((member) => (
            <li key={member.user.id}>
              {member.user.name} ({member.user.email})
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-slate-800">Invite link</p>
        <CopyLink value={inviteUrl} />
        <Button
          type="button"
          variant="secondary"
          disabled={rotate.isPending}
          onClick={() => void rotate.mutateAsync()}
        >
          Rotate invite link
        </Button>
        {rotate.isError ? <ErrorMessage error={rotate.error} /> : null}
      </div>
      <div className="mt-4 flex items-center gap-3">
        {team.project ? (
          <>
            <Badge tone={team.project.status === "SUBMITTED" ? "green" : "amber"}>
              {team.project.status}
            </Badge>
            <Link
              to={`/teams/${team.id}/project`}
              className="text-sm text-indigo-600 hover:underline"
            >
              {team.project.title || "Edit project"}
            </Link>
          </>
        ) : (
          <Link to={`/teams/${team.id}/project`} className="text-sm text-indigo-600 hover:underline">
            Create project
          </Link>
        )}
      </div>
    </Card>
  );
}

function MyTeamsContent() {
  const teamsQuery = useMyTeams();
  if (teamsQuery.isLoading) return <p className="text-slate-600">Loading teams…</p>;
  if (teamsQuery.isError) return <ErrorMessage error={teamsQuery.error} />;
  const teams = teamsQuery.data?.teams ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">My teams</h1>
      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          description="Open an event and create or join a team."
        />
      ) : (
        teams.map((team) => <TeamCard key={team.id} team={team} />)
      )}
    </div>
  );
}

export function MyTeamsPage() {
  return (
    <RequireRole>
      <MyTeamsContent />
    </RequireRole>
  );
}
