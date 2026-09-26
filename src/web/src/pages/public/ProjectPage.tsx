import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useProject } from "../../api/hooks/projects";
import { useProjectComments, usePostComment, useDeleteComment } from "../../api/hooks/community";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorMessage } from "../../components/ErrorMessage";
import { DateTime } from "../../lib/datetime";
import { isSafeUrl } from "../../lib/url";

const MAX_COMMENT_LENGTH = 2000;

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CommentsSection({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const commentsQuery = useProjectComments(projectId);
  const postComment = usePostComment(projectId);
  const deleteComment = useDeleteComment(projectId);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await postComment.mutateAsync(trimmed);
      setBody("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "duplicate_comment") setError("You already posted this comment recently.");
        else if (err.status === 429) setError("Too many comments. Please wait a moment.");
        else setError(err.message);
      } else {
        setError("Something went wrong.");
      }
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteComment.mutateAsync(commentId);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  }

  if (commentsQuery.isLoading) return <p className="text-slate-600">Loading comments…</p>;
  if (commentsQuery.isError) return <ErrorMessage error={commentsQuery.error} />;
  const comments = commentsQuery.data ?? [];

  return (
    <Card title="Comments">
      {comments.length === 0 ? (
        <EmptyState title="No comments yet" description="Be the first to comment." />
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-slate-900">{c.author.name}</span>
                  <span className="ml-2 text-xs text-slate-500" title={new Date(c.createdAt).toISOString()}>
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                {user && user.id === c.author.id ? (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => void handleDelete(c.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <div className="space-y-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Add a comment</span>
            <textarea
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              rows={3}
              maxLength={MAX_COMMENT_LENGTH}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
            />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {body.length} / {MAX_COMMENT_LENGTH}
            </span>
            <Button
              disabled={body.trim().length === 0 || postComment.isPending}
              onClick={() => void handlePost()}
            >
              {postComment.isPending ? "Posting…" : "Post comment"}
            </Button>
          </div>
          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          <Link to="/login" className="text-indigo-600 hover:underline">Log in</Link> to comment.
        </p>
      )}
    </Card>
  );
}

export function ProjectPage() {
  const { projectId } = useParams();
  const projectQuery = useProject(projectId);

  if (projectQuery.isLoading) return <p className="text-slate-600">Loading project…</p>;
  if (projectQuery.isError) return <ErrorMessage error={projectQuery.error} />;
  const project = projectQuery.data?.project;
  if (!project) return <EmptyState title="Project not found" />;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">
          <Link to={`/events/${project.eventId}`} className="text-indigo-600 hover:underline">
            Back to event
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{project.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {project.teamName} · {project.trackName ?? "No track"} · {project.status}
        </p>
      </div>
      <Card title="Summary">
        <p className="whitespace-pre-wrap text-slate-700">{project.summary || "—"}</p>
      </Card>
      <Card title="Links">
        <ul className="space-y-2 text-sm">
          <li>
            Repo:{" "}
            {isSafeUrl(project.repoUrl) ? (
              <a className="text-indigo-600 hover:underline" href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                {project.repoUrl}
              </a>
            ) : (
              "—"
            )}
          </li>
          <li>
            Demo:{" "}
            {isSafeUrl(project.demoUrl) ? (
              <a className="text-indigo-600 hover:underline" href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                {project.demoUrl}
              </a>
            ) : (
              "—"
            )}
          </li>
          <li>
            Submitted: <DateTime value={project.submittedAt} />
          </li>
        </ul>
      </Card>
      <CommentsSection projectId={project.id} />
    </div>
  );
}
