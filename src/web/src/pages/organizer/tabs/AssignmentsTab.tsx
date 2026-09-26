import { useState } from "react";
import {
  useAssignments,
  useAutoAssign,
  useDeleteAssignment,
} from "../../../api/hooks/judging";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Table } from "../../../components/Table";

export function AssignmentsTab({ eventId }: { eventId: string }) {
  const assignmentsQuery = useAssignments(eventId);
  const autoAssign = useAutoAssign(eventId);
  const deleteAssignment = useDeleteAssignment(eventId);
  const [unassignable, setUnassignable] = useState<
    Array<{ projectId: string; reason: string }>
  >([]);
  const [created, setCreated] = useState<number | null>(null);

  async function runAutoAssign() {
    const result = await autoAssign.mutateAsync();
    setCreated(result.created);
    setUnassignable(result.unassignable);
  }

  if (assignmentsQuery.isLoading) return <p className="text-slate-600">Loading assignments…</p>;
  if (assignmentsQuery.isError) return <ErrorMessage error={assignmentsQuery.error} />;

  const assignments = assignmentsQuery.data?.assignments ?? [];

  return (
    <div className="space-y-6">
      <Card
        title="Auto-assign"
        actions={
          <Button
            type="button"
            disabled={autoAssign.isPending}
            onClick={() => void runAutoAssign()}
          >
            {autoAssign.isPending ? "Assigning…" : "Run auto-assign"}
          </Button>
        }
      >
        <p className="text-sm text-slate-600">
          Assigns judges to submitted projects using track preferences and load balancing.
        </p>
        {autoAssign.isError ? <ErrorMessage error={autoAssign.error} /> : null}
        {created !== null ? (
          <p className="mt-2 text-sm text-green-700">Created {created} new assignment(s).</p>
        ) : null}
      </Card>

      {unassignable.length > 0 ? (
        <Card title="Unassignable projects">
          <ul className="space-y-2 text-sm text-slate-700">
            {unassignable.map((item) => (
              <li key={item.projectId}>
                <span className="font-medium">{item.projectId}</span>: {item.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Assignments">
        {assignments.length === 0 ? (
          <EmptyState title="No assignments" description="Run auto-assign after inviting judges." />
        ) : (
          <Table
            rows={assignments}
            rowKey={(row) => row.id}
            columns={[
              { key: "judge", header: "Judge", render: (row) => row.judgeName },
              { key: "project", header: "Project", render: (row) => row.projectTitle },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Badge tone={row.status === "SUBMITTED" ? "green" : "amber"}>
                    {row.status}
                  </Badge>
                ),
              },
              {
                key: "actions",
                header: "",
                render: (row) =>
                  row.status === "PENDING" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={deleteAssignment.isPending}
                      onClick={() => void deleteAssignment.mutateAsync(row.id)}
                    >
                      Unassign
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
        {deleteAssignment.isError ? (
          <div className="mt-2">
            <ErrorMessage error={deleteAssignment.error} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
