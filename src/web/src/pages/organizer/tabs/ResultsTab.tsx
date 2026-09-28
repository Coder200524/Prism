import { useState } from "react";
import {
  downloadEventCsv,
  useEventResults,
  usePublishResults,
  useUnpublishResults,
} from "../../../api/hooks/judging";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Table } from "../../../components/Table";

export function ResultsTab({ eventId }: { eventId: string }) {
  const resultsQuery = useEventResults(eventId);
  const publish = usePublishResults(eventId);
  const unpublish = useUnpublishResults(eventId);
  const [csvError, setCsvError] = useState<unknown>(null);
  const [csvBusy, setCsvBusy] = useState<"results" | "scores" | null>(null);

  async function download(type: "results" | "scores") {
    setCsvError(null);
    setCsvBusy(type);
    try {
      await downloadEventCsv(eventId, type);
    } catch (error) {
      setCsvError(error);
    } finally {
      setCsvBusy(null);
    }
  }

  if (resultsQuery.isLoading) return <p className="text-df-dim">Loading results…</p>;
  if (resultsQuery.isError) return <ErrorMessage error={resultsQuery.error} />;
  const data = resultsQuery.data;
  if (!data) return null;

  const tracks = data.results.tracks;

  return (
    <div className="space-y-6">
      <Card
        title="Publish results"
        actions={
          data.published ? (
            <Button
              type="button"
              variant="secondary"
              disabled={unpublish.isPending}
              onClick={() => void unpublish.mutateAsync()}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              type="button"
              disabled={publish.isPending}
              onClick={() => void publish.mutateAsync()}
            >
              Publish results
            </Button>
          )
        }
      >
        <p className="text-sm text-df-dim">
          {data.published
            ? "Results are public. Publishing also closes judging."
            : "Results are organizer-only until published."}
        </p>
        {publish.isError || unpublish.isError ? (
          <div className="mt-2">
            <ErrorMessage error={publish.error ?? unpublish.error} />
          </div>
        ) : null}
      </Card>

      <Card title="CSV export">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={csvBusy !== null}
            onClick={() => void download("results")}
          >
            {csvBusy === "results" ? "Downloading…" : "Download results CSV"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={csvBusy !== null}
            onClick={() => void download("scores")}
          >
            {csvBusy === "scores" ? "Downloading…" : "Download scores CSV"}
          </Button>
        </div>
        {csvError ? (
          <div className="mt-2">
            <ErrorMessage error={csvError} />
          </div>
        ) : null}
      </Card>

      {tracks.length === 0 ? (
        <EmptyState title="No results yet" description="Scores will appear after judges submit." />
      ) : (
        tracks.map((track) => (
          <Card key={track.trackId ?? "none"} title={track.trackName ?? "No track"}>
            {track.projects.length === 0 ? (
              <EmptyState title="No projects in this track" />
            ) : (
              <Table
                rows={track.projects}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: "rank",
                    header: "Rank",
                    render: (row) => row.rank ?? "—",
                  },
                  { key: "title", header: "Title", render: (row) => row.title },
                  {
                    key: "reviews",
                    header: "Reviews",
                    render: (row) => row.reviewCount,
                  },
                  {
                    key: "raw",
                    header: "Raw",
                    render: (row) => row.rawScore ?? "—",
                  },
                  {
                    key: "normalized",
                    header: "Normalized",
                    render: (row) => row.normalizedScore ?? "—",
                  },
                  {
                    key: "flags",
                    header: "Flags",
                    render: (row) =>
                      (row.flags ?? []).length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(row.flags ?? []).map((flag) => (
                            <Badge key={flag} tone="amber">
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      ),
                  },
                ]}
              />
            )}
          </Card>
        ))
      )}
    </div>
  );
}
