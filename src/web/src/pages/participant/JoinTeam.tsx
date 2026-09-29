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

  if (previewQuery.isLoading) return <p className="text-df-dim">Loading invite…</p>;
  if (previewQuery.isError) return <ErrorMessage error={previewQuery.error} />;
  const preview = previewQuery.data;
  if (!preview) return null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-df-text">Join team</h1>
      <Card>
        <p className="text-df-text">
          <span className="font-medium">{preview.teamName}</span> in {preview.eventName}
        </p>
        <p className="mt-2 text-sm text-df-dim">
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
      <Link to="/" className="block text-sm text-df-pink hover:text-df-cyan transition-colors font-mono">
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
