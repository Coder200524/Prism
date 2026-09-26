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

  if (previewQuery.isLoading) return <p className="text-slate-600">Loading invite…</p>;
  if (previewQuery.isError) return <ErrorMessage error={previewQuery.error} />;
  const preview = previewQuery.data;
  if (!preview) return null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Judge invite</h1>
      <Card>
        <p className="text-slate-800">
          You are invited to judge <span className="font-medium">{preview.eventName}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">Invite email: {preview.email}</p>
        <p className="mt-1 text-sm text-slate-600">Signed in as: {user?.email}</p>
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
      <Link to="/" className="block text-sm text-indigo-600 hover:underline">
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
