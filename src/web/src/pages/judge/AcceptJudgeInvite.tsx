import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useAcceptJudgeInvite,
  useJudgeInvitePreview,
} from "../../api/hooks/judging";
import { useAuth } from "../../auth/AuthContext";
import { RequireRole } from "../../auth/RequireRole";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorMessage } from "../../components/ErrorMessage";

function AcceptJudgeInviteContent() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const previewQuery = useJudgeInvitePreview(token);
  const accept = useAcceptJudgeInvite(token);

  if (previewQuery.isLoading) return <p className="text-df-dim">Loading invite…</p>;
  if (previewQuery.isError) return <ErrorMessage error={previewQuery.error} />;
  const preview = previewQuery.data;
  if (!preview) return null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-df-text">Judge invite</h1>
      <Card>
        <p className="text-df-text">
          You are invited to judge <span className="font-medium">{preview.eventName}</span>
        </p>
        <p className="mt-2 text-sm text-df-dim">Invite email: {preview.email}</p>
        <p className="mt-1 text-sm text-df-dim">Signed in as: {user?.email}</p>
      </Card>
      {accept.isError ? <ErrorMessage error={accept.error} /> : null}
      <Button
        type="button"
        disabled={accept.isPending}
        onClick={() => {
          void accept.mutateAsync().then(() => navigate("/judge"));
        }}
      >
        {accept.isPending ? "Accepting…" : "Accept invite"}
      </Button>
      <Link to="/" className="block text-sm text-df-pink hover:text-df-cyan transition-colors font-mono">
        Cancel
      </Link>
    </div>
  );
}

export function AcceptJudgeInvitePage() {
  return (
    <RequireRole>
      <AcceptJudgeInviteContent />
    </RequireRole>
  );
}
