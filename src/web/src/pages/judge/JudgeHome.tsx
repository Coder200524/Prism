import { Link } from "react-router-dom";
import { useMyJudgeAssignments } from "../../api/hooks/judging";
import { RequireRole } from "../../auth/RequireRole";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";

function JudgeHomeContent() {
  const assignmentsQuery = useMyJudgeAssignments();

  if (assignmentsQuery.isLoading) return <p className="text-df-dim">Loading assignments…</p>;
  if (assignmentsQuery.isError) return <ErrorMessage error={assignmentsQuery.error} />;

  const assignments = assignmentsQuery.data?.assignments ?? [];
  const byEvent = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = byEvent.get(assignment.eventId) ?? [];
    list.push(assignment);
    byEvent.set(assignment.eventId, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-df-text">Judging</h1>
        <Link to="/judge/scores" className="text-sm text-df-pink hover:text-df-cyan transition-colors font-mono">
          My scores
        </Link>
      </div>

      {byEvent.size === 0 ? (
        <EmptyState title="No assignments" description="You have no projects to score yet." />
      ) : (
        [...byEvent.entries()].map(([eventId, eventAssignments]) => {
          const submitted = eventAssignments.filter((row) => row.status === "SUBMITTED").length;
          return (
            <Card
              key={eventId}
              title={eventAssignments[0]?.eventName ?? eventId}
              actions={
                <span className="text-sm text-df-dim">
                  {submitted} / {eventAssignments.length} submitted
                </span>
              }
            >
              <ul className="space-y-3">
                {eventAssignments.map((assignment) => (
                  <li
                    key={assignment.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <Link
                        to={`/judge/assignments/${assignment.id}`}
                        className="font-medium text-df-pink hover:text-df-cyan transition-colors font-mono"
                      >
                        {assignment.project.title}
                      </Link>
                      <p className="text-sm text-df-dim">{assignment.project.summary}</p>
                    </div>
                    <Badge tone={assignment.status === "SUBMITTED" ? "green" : "amber"}>
                      {assignment.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

export function JudgeHomePage() {
  return (
    <RequireRole>
      <JudgeHomeContent />
    </RequireRole>
  );
}
