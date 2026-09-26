import { Link } from "react-router-dom";
import { useMyJudgeScores } from "../../api/hooks/judging";
import { RequireRole } from "../../auth/RequireRole";
import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Table } from "../../components/Table";
import { DateTime } from "../../lib/datetime";

function MyScoresContent() {
  const scoresQuery = useMyJudgeScores();

  if (scoresQuery.isLoading) return <p className="text-slate-600">Loading scores…</p>;
  if (scoresQuery.isError) return <ErrorMessage error={scoresQuery.error} />;
  const items = scoresQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link to="/judge" className="text-sm text-indigo-600 hover:underline">
          Back to judging
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">My scores</h1>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No submitted scores yet" />
      ) : (
        <Table
          rows={items}
          rowKey={(row) => row.assignmentId}
          columns={[
            {
              key: "title",
              header: "Project",
              render: (row) => (
                <Link
                  to={`/judge/assignments/${row.assignmentId}`}
                  className="text-indigo-600 hover:underline"
                >
                  {row.projectTitle}
                </Link>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <Badge tone={row.status === "SUBMITTED" ? "green" : "amber"}>{row.status}</Badge>
              ),
            },
            {
              key: "total",
              header: "Weighted total",
              render: (row) => row.weightedTotal ?? "—",
            },
            {
              key: "submitted",
              header: "Submitted",
              render: (row) => <DateTime value={row.submittedAt} />,
            },
          ]}
        />
      )}
    </div>
  );
}

export function MyScoresPage() {
  return (
    <RequireRole>
      <MyScoresContent />
    </RequireRole>
  );
}
