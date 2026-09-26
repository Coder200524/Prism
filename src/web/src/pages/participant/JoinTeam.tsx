import { Link, useNavigate, useParams } from "react-router-dom";
import { useInvitePreview, useJoinTeam } from "../../api/hooks/teams";
import { RequireRole } from "../../auth/RequireRole";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorMessage } from "../../components/ErrorMessage";

function JoinTeamForm() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const previewQuery = useInvitePreview(code);
  const joinMutation = useJoinTeam(code);

  if (previewQuery.isLoading) return <p className="text-slate-600">Loading invite…</p>;
  if (previewQuery.isError) return <ErrorMessage error={previewQuery.error} />;
  const preview = previewQuery.data;
  if (!preview) return null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Join team</h1>
      <Card>
        <p className="text-slate-800">
          <span className="font-medium">{preview.teamName}</span> in {preview.eventName}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {preview.memberCount} / {preview.maxTeamSize} members
        </p>
      </Card>
      {joinMutation.isError ? <ErrorMessage error={joinMutation.error} /> : null}
      <Button
        type="button"
        disabled={joinMutation.isPending}
        onClick={() => {
          void joinMutation.mutateAsync().then(() => navigate("/teams"));
        }}
      >
        {joinMutation.isPending ? "Joining…" : "Join team"}
      </Button>
      <Link to="/" className="block text-sm text-indigo-600 hover:underline">
        Cancel
      </Link>
    </div>
  );
}

export function JoinTeamPage() {
  return (
    <RequireRole>
      <JoinTeamForm />
    </RequireRole>
  );
}
