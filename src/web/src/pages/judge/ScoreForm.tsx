import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useJudgeAssignment, useUpdateScores } from "../../api/hooks/judging";
import { RequireRole } from "../../auth/RequireRole";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Input } from "../../components/Input";
import { Textarea } from "../../components/Textarea";
import { isSafeUrl } from "../../lib/url";

function ScoreFormContent() {
  const { assignmentId = "" } = useParams();
  const assignmentQuery = useJudgeAssignment(assignmentId);
  const updateScores = useUpdateScores(assignmentId);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const assignment = assignmentQuery.data?.assignment;
    if (!assignment) return;
    setComment(assignment.comment);
    const next: Record<string, string> = {};
    for (const criterion of assignment.criteria) {
      const value = assignment.scores[criterion.key];
      next[criterion.key] = value === undefined ? "" : String(value);
    }
    setScores(next);
  }, [assignmentQuery.data]);

  if (assignmentQuery.isLoading) return <p className="text-df-dim">Loading assignment…</p>;
  if (assignmentQuery.isError) return <ErrorMessage error={assignmentQuery.error} />;
  const assignment = assignmentQuery.data?.assignment;
  if (!assignment) return null;

  function scoresPayload(): Record<string, number> {
    const payload: Record<string, number> = {};
    for (const [key, value] of Object.entries(scores)) {
      if (value === "") continue;
      payload[key] = Number(value);
    }
    return payload;
  }

  async function save(submit: boolean) {
    setMessage(null);
    await updateScores.mutateAsync({
      scores: scoresPayload(),
      comment,
      submit,
    });
    setMessage(submit ? "Scores submitted." : "Draft saved.");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link to="/judge" className="text-sm text-df-pink hover:text-df-cyan transition-colors font-mono">
          ← Back to judging
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-df-text">{assignment.project.title}</h1>
        <div className="mt-2">
          <Badge tone={assignment.status === "SUBMITTED" ? "green" : "amber"}>
            {assignment.status}
          </Badge>
        </div>
      </div>

      <Card title="Project">
        <p className="whitespace-pre-wrap text-sm text-df-text">{assignment.project.summary}</p>
        <div className="mt-3 space-y-1 text-sm">
          {isSafeUrl(assignment.project.repoUrl) ? (
            <p>
              Repo:{" "}
              <a
                href={assignment.project.repoUrl}
                className="text-df-pink hover:text-df-cyan transition-colors font-mono"
                target="_blank"
                rel="noreferrer"
              >
                {assignment.project.repoUrl}
              </a>
            </p>
          ) : null}
          {isSafeUrl(assignment.project.demoUrl) ? (
            <p>
              Demo:{" "}
              <a
                href={assignment.project.demoUrl}
                className="text-df-pink hover:text-df-cyan transition-colors font-mono"
                target="_blank"
                rel="noreferrer"
              >
                {assignment.project.demoUrl}
              </a>
            </p>
          ) : null}
        </div>
      </Card>

      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void save(false);
        }}
      >
        {assignment.criteria.map((criterion) => (
          <div key={criterion.id} className="space-y-1">
            <Input
              label={`${criterion.name} (${criterion.minScore}–${criterion.maxScore}, weight ${criterion.weight})`}
              type="number"
              min={criterion.minScore}
              max={criterion.maxScore}
              value={scores[criterion.key] ?? ""}
              onChange={(e) =>
                setScores((current) => ({ ...current, [criterion.key]: e.target.value }))
              }
            />
            {criterion.description ? (
              <p className="text-xs text-df-dim">{criterion.description}</p>
            ) : null}
          </div>
        ))}

        <Textarea
          label="Comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {updateScores.isError ? <ErrorMessage error={updateScores.error} /> : null}
        {message ? <p className="text-sm text-df-cyan">{message}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" disabled={updateScores.isPending}>
            Save draft
          </Button>
          <Button
            type="button"
            disabled={updateScores.isPending}
            onClick={() => void save(true)}
          >
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ScoreFormPage() {
  return (
    <RequireRole>
      <ScoreFormContent />
    </RequireRole>
  );
}
