import { useDashboard } from "../../../api/hooks/judging";
import { Badge } from "../../../components/Badge";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Table } from "../../../components/Table";
import { DateTime } from "../../../lib/datetime";

function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-slate-600">
        <span>{label}</span>
        <span>{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded bg-slate-100">
        <div className="h-2 rounded bg-indigo-600" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function DashboardTab({ eventId }: { eventId: string }) {
  const dashboardQuery = useDashboard(eventId, true);

  if (dashboardQuery.isLoading) return <p className="text-slate-600">Loading dashboard…</p>;
  if (dashboardQuery.isError) return <ErrorMessage error={dashboardQuery.error} />;
  const data = dashboardQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Card title="Judging progress">
        <p className="mb-3 text-sm text-slate-600">
          Updated <DateTime value={data.generatedAt} /> · refreshes every 5 seconds
        </p>
        <div className="space-y-4">
          <ProgressBar value={data.totals.percentComplete} label="Assignments submitted" />
          <ProgressBar value={data.totals.coveragePercent} label={`Target coverage (${data.totals.targetCoverage} reviews)`} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-slate-500">Projects</dt>
            <dd className="font-medium">{data.totals.projects}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Assignments</dt>
            <dd className="font-medium">{data.totals.assignments}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Submitted</dt>
            <dd className="font-medium">{data.totals.submitted}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Pending</dt>
            <dd className="font-medium">{data.totals.pending}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Judges">
        {data.judges.length === 0 ? (
          <EmptyState title="No judges" />
        ) : (
          <Table
            rows={data.judges}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Name", render: (row) => row.name },
              {
                key: "progress",
                header: "Submitted / assigned",
                render: (row) => `${row.submitted} / ${row.assigned}`,
              },
              {
                key: "bar",
                header: "Progress",
                render: (row) => (
                  <ProgressBar
                    value={row.assigned === 0 ? 0 : (row.submitted / row.assigned) * 100}
                    label=""
                  />
                ),
              },
              {
                key: "flat",
                header: "Flags",
                render: (row) =>
                  row.flatScorer ? <Badge tone="amber">flat scorer</Badge> : null,
              },
            ]}
          />
        )}
      </Card>

      <Card title="Projects">
        {data.projects.length === 0 ? (
          <EmptyState title="No submitted projects" />
        ) : (
          <Table
            rows={data.projects}
            rowKey={(row) => row.id}
            columns={[
              { key: "title", header: "Title", render: (row) => row.title },
              { key: "track", header: "Track", render: (row) => row.track ?? "—" },
              {
                key: "reviews",
                header: "Reviews",
                render: (row) => `${row.submitted} / ${row.assigned}`,
              },
              {
                key: "bar",
                header: "Progress",
                render: (row) => (
                  <ProgressBar
                    value={row.assigned === 0 ? 0 : (row.submitted / row.assigned) * 100}
                    label=""
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card title="Flags">
        {data.flags.length === 0 ? (
          <EmptyState title="No flags" />
        ) : (
          <ul className="space-y-2 text-sm">
            {data.flags.map((flag, index) => (
              <li key={`${flag.type}-${flag.targetId}-${index}`} className="flex gap-2">
                <Badge tone="amber">{flag.type}</Badge>
                <span className="text-slate-700">{flag.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
