import { useState } from "react";
import { useAuditLog } from "../../../api/hooks/judging";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Table } from "../../../components/Table";
import { DateTime } from "../../../lib/datetime";

export function AuditTab({ eventId }: { eventId: string }) {
  const [page, setPage] = useState(1);
  const auditQuery = useAuditLog(eventId, page);

  if (auditQuery.isLoading) return <p className="text-df-dim">Loading audit log…</p>;
  if (auditQuery.isError) return <ErrorMessage error={auditQuery.error} />;
  const data = auditQuery.data;
  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <Card title="Audit log">
      {data.items.length === 0 ? (
        <EmptyState title="No audit entries" />
      ) : (
        <Table
          rows={data.items}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "at",
              header: "When",
              render: (row) => <DateTime value={row.at} />,
            },
            {
              key: "actor",
              header: "Actor",
              render: (row) => row.actor?.name ?? "—",
            },
            { key: "action", header: "Action", render: (row) => row.action },
            { key: "summary", header: "Summary", render: (row) => row.summary },
          ]}
        />
      )}
      <div className="mt-4 flex items-center gap-3 text-sm text-df-dim">
        <Button
          type="button"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {totalPages} ({data.total} total)
        </span>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>
    </Card>
  );
}
